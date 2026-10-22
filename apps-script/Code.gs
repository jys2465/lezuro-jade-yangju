/**
 * 파크골프 공략노트 — 통합 서버 (구글 앱스크립트)  v3
 *
 * 서버 하나로 모든 매장을 운영합니다. 계정·이용권·코스 목록은 전체 공통, 기록은 매장별(매장마다 센서·타격감이 달라서).
 * 처음 한 번(그리고 새 버전을 붙여 넣은 뒤 한 번) setup() 을 실행하고, 웹 앱으로 배포하세요. (README 참고)
 *
 * 등급
 *  - admin(관리자): 모든 것, 모든 매장
 *  - op(운영자): 소속 매장 하나. 그 매장이 기본 매장인 회원의 체험 만들기·연장·비밀번호, 그 매장 문의·공지
 *  - trial(체험 5일, 하루씩 최대 2번 연장. 로그인 화면에서 직접 가입하면 바로 체험 시작) · month(월간 30일) · year(연간 365일) — 이용권은 전 매장 공통
 *
 * 원칙
 *  - 모든 권한 검사는 서버에서 합니다.
 *  - 회원은 바뀌지 않는 회원번호(uid)로 기록됩니다. 닉네임은 보이는 이름이라 바꿀 수 있어요(전체에서 중복 불가).
 *  - 비밀번호는 암호화해서만 저장합니다(회원 4자리, 운영자·관리자 6자리). 틀리면 점점 길게 잠급니다.
 */

var APP = 'parkgolf-note';
var VER = 3.1;
var TZ = 'Asia/Seoul';
var SERVICE = '파크골프 공략노트';
/** 관리자 닉네임. setup() 이 이 닉네임으로 관리자 계정을 만듭니다(이미 있으면 관리자로 바꿉니다). */
var ADMIN_NICK = '관리자';
/** 처음 만들어 둘 매장(코드, 이름). 예전 v2 자료는 첫 번째 매장(yangju) 기록으로 옮겨집니다. 매장은 앱 관리자 화면에서 더 만들 수 있어요. */
var SEED_BRANCHES = [['yangju', '제이드 양주점'], ['mansong', '양주만송점']];
var BRANCH = SEED_BRANCHES[0][0];
/** 결제 처음 값 — 관리자 화면에서 바꿀 수 있습니다. */
var PAY_DEFAULTS = {
  price_month: '1000',
  price_year: '9000',
  qr_month: 'https://qr.kakaopay.com/281006011000000956229137',
  qr_year: 'https://qr.kakaopay.com/281006011000000956229137',
  bank_name: '카카오뱅크',
  bank_no: '3333-05-8835107',
  bank_holder: '주*수',
  seats: '40'
};
var PLAN = { month: { name: '월간회원', days: 30 }, year: { name: '연간회원', days: 365 } };
var KIND_NAME = { admin: '관리자', op: '운영자', trial: '체험회원', month: '월간회원', year: '연간회원' };

var LIM = {
  sessionDays: 60, extendLeftDays: 30, failMax: 5,
  lockSteps: [10, 60, 1440],  // 5번 틀릴 때마다 잠그는 시간(분): 10분 → 1시간 → 하루
  loginPerMin: 120,           // 서버 전체 1분당 로그인 시도
  loginPerNick: 15,           // 한 닉네임 10분당 시도(없는 닉네임 포함)
  reqMax: 700000, logoMax: 450000, cell: 45000, logRows: 3000,
  idleMs: 10 * 60000,         // 10분 동안 아무 움직임이 없으면 좌석을 비움
  touchMs: 60000, seenSaveMs: 5 * 60000, queueStaleMs: 45000,
  renewDays: 14, trialDays: 5, trialExtMax: 2, refundFullDays: 7,
  nickEveryDays: 7, nickProtectDays: 7, homeEveryDays: 30,
  joinDevDays: 30,            // 한 휴대폰에서 직접 체험 가입은 30일에 1번
  joinPerHour: 30,            // 서버 전체 1시간 직접 가입 수(하루 한도는 관리자 설정 join_per_day, 처음 100)
  backupWeeks: 8
};
function pinLen_(u) { return u && (u.kind === 'admin' || u.kind === 'op') ? 6 : 4; }

var SH = {
  users:    ['nick', 'kind', 'start', 'end', 'hash', 'salt', 'must', 'active', 'fail', 'lock', 'created', 'last', 'ext', 'seen', 'uid', 'home', 'homeAt', 'nickAt', 'prev', 'prevUntil', 'lastBr', 'lockN', 'plen', 'src', 'dev', 'ref', 'refPay'],
  sessions: ['th', 'uid', 'exp', 'dev', 'created'],
  courses:  ['id', 'name', 'key', 'reg', 'holes', 'created', 'upd', 'updBy', 'stage'],
  records:  ['cid', 'uid', 'filled', 'json', 'upd', 'br'],
  prefs:    ['uid', 'cid', 'pub'],
  payments: ['id', 'uid', 'plan', 'amount', 'method', 'depositor', 'status', 'created', 'decided', 'by', 'start', 'end', 'refund', 'refundAt', 'name'],
  settings: ['key', 'val'],
  log:      ['ts', 'nick', 'act', 'info'],
  uses:     ['owner', 'user', 'cid', 'first', 'last', 'br'],   // 신뢰도: user 가 owner 의 기록(그 매장·그 코스)을 가져다 씀 → 1점
  faq:      ['id', 'order', 'q', 'a', 'upd'],
  qna:      ['id', 'uid', 'cat', 'cid', 'title', 'status', 'created', 'updated', 'lastBy', 'msgs', 'seenUser', 'seenStaff', 'meta', 'br'],
  branches: ['code', 'name', 'active', 'order', 'created'],
  notices:  ['id', 'br', 'title', 'html', 'pin', 'start', 'end', 'popup', 'by', 'created', 'upd', 'img', 'btns'],
  images:   ['id', 'part', 'data', 'created'],
  refunds:  ['id', 'uid', 'pid', 'created', 'status', 'bank', 'acct', 'holder', 'reason', 'amount', 'remain', 'why', 'decided', 'by', 'note', 'name']
};
var TITLE = {
  users: '회원', sessions: '로그인기록', courses: '코스', records: '기록', prefs: '공개설정', payments: '결제', settings: '설정', log: '이력',
  uses: '신뢰도', faq: '자주묻는질문', qna: '문의', branches: '지점', notices: '공지', images: '그림', refunds: '환불신청'
};

/* ───────────── 입구 ───────────── */

function doGet() { return json_({ ok: true, app: APP, ver: VER }); }

function doPost(e) {
  var out; resetMemo_();
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > LIM.reqMax) throw E_('big', '보내는 내용이 너무 커요');
    var q = JSON.parse(raw);
    var h = H[q.a];
    if (!h) throw E_('bad', '알 수 없는 요청이에요');
    if (q.br === undefined && q.b) q.br = q.b;                        // 예전 화면(v2)은 매장 코드를 b 로 보냄
    if (q.br && !findBranch_(q.br)) throw E_('branch', '없는 매장이에요. 앱을 새로 고침해 주세요.');
    out = h.pub ? run_(h, null, q) : authed_(h, q);
  } catch (err) {
    if (err && err.lz) out = err.body;
    else { console.error(err && err.stack ? err.stack : String(err)); out = { ok: false, err: 'server', msg: '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.' }; }
  }
  return json_(out);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function E_(code, msg, extra) { var body = { ok: false, err: code, msg: msg }; if (extra) for (var k in extra) body[k] = extra[k]; return { lz: true, body: body }; }

/** 쓰기 요청은 한 번에 하나씩 처리합니다(동시에 저장해도 꼬이지 않게). */
function run_(h, ctx, q) {
  if (!h.w) return h.fn(q, ctx);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw E_('busy', '지금 다른 분이 저장 중이에요. 잠시 뒤에 다시 해 주세요.');
  try {
    resetMemo_();                                                           // 기다리는 동안 다른 요청이 바꾼 내용을 다시 읽음
    if (ctx && ctx.u) { var fresh = userByUid_(ctx.u.uid); if (!fresh || !fresh.active) throw E_('auth', '이 계정은 지금 쓸 수 없어요. 운영자에게 문의해 주세요.'); ctx.u = fresh; }   // 기다리는 동안 바뀐 회원 정보(결제 승인·삭제로 줄이 밀림 등)를 다시 읽음
    return h.fn(q, ctx);
  }
  finally {
    try { SpreadsheetApp.flush(); } catch (e) { /* 무시 */ }   // ★ 잠금을 풀기 전에 시트에 바로 기록 — 다음 요청이 옛 내용을 읽지 않게(두 번 승인 방지)
    lock.releaseLock();
  }
}
function authed_(h, q) {
  var ctx = session_(String(q.t || ''));
  var u = ctx.u, st = ctx.st;
  ctx.br = pickBranch_(u, q.br);
  if (!h.noSeat) seat_(u);
  if (u.must && !h.mustOk) throw E_('must', '먼저 나만의 비밀번호로 바꿔 주세요.');   // 처음 비밀번호·운영진 6자리 변경 전에는 다른 기능 막음
  if (h.admin && u.kind !== 'admin') throw E_('perm', '관리자만 할 수 있어요.');
  if (h.staff && !isStaff_(u)) throw E_('perm', '운영자나 관리자만 할 수 있어요.');
  if (h.write && !canWrite_(st)) throw E_('expired', '이용 기간이 끝나서 할 수 없어요. 이용권을 결제하면 다시 쓸 수 있어요.');
  if (h.reg && !canReg_(u, st)) throw E_('perm', '코스 등록은 월간·연간회원부터 할 수 있어요.');
  return run_(h, ctx, q);
}

/* ───────────── 시간·문자 도구 ───────────── */

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function ymd_(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
function addDays_(s, n) { var p = s.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return ymd_(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
function diffDays_(a, b) { var x = a.split('-'), y = b.split('-'); return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / 86400000); }
function dayStart_(d) { var p = d.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) - 9 * 3600000; }   // 서울 0시(밀리초)
function str_(v) { if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd'); return v === null || v === undefined ? '' : String(v); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function hex_(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; s += ('0' + b.toString(16)).slice(-2); } return s; }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function eq_(a, b) { a = String(a); b = String(b); var d = a.length === b.length ? 0 : 1, n = Math.max(a.length, b.length); for (var i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
function rand_(len) { var s = ''; while (s.length < len) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, len); }
function pepper_() { var v = PropertiesService.getScriptProperties().getProperty('PEPPER'); if (!v) throw E_('setup', '서버 준비가 안 됐어요. 개발자에게 setup 실행을 요청해 주세요.'); return v; }
function hashPin_(pin, salt) { return sha_(salt + ':' + pin + ':' + pepper_()); }
function genPin_(len) {
  len = len || 4;
  for (var i = 0; i < 80; i++) { var p = String(parseInt(rand_(12), 16) % Math.pow(10, len)); while (p.length < len) p = '0' + p; if (!weakPin_(p)) return p; }
  return len === 6 ? '472918' : '4721';
}
function weakPin_(p) {
  if (/^(\d)\1+$/.test(p)) return true;
  var up = '0123456789', dn = '9876543210';
  return up.indexOf(p) >= 0 || dn.indexOf(p) >= 0 || (p.length === 6 && /^(\d\d)\1\1$|^(\d\d\d)\2$/.test(p));
}
function normNick_(s) { return String(s === undefined || s === null ? '' : s).replace(/[\s　​﻿]+/g, ''); }
function nickKey_(s) { return normNick_(s).toLowerCase(); }
function okNick_(s) { return /^[가-힣A-Za-z0-9]{2,8}$/.test(s); }

/* ───────────── 시트 읽기·쓰기 ───────────── */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
var COLS_OK_ = {};
/* 한 요청 안에서 같은 시트를 여러 번 읽지 않게 기억(쓰기가 있으면 그 시트는 다시 읽음) — 화면이 빨라져요 */
var ROWS_ = {};
function resetMemo_() { ROWS_ = {}; }
function sheet_(name) { delete ROWS_[name]; return sheetGet_(name); }   // 쓰려고 시트를 꺼내면 기억을 지움
function sheetGet_(name) {
  var ss = ss_(), s = ss.getSheetByName(TITLE[name]);
  if (s) {
    if (!COLS_OK_[name]) {                                                 // 새 버전에서 칸이 늘었는데 setup 을 안 돌렸을 때도 괜찮게
      COLS_OK_[name] = 1;
      var need = SH[name].length;
      if (s.getMaxColumns && s.getMaxColumns() < need) { s.insertColumnsAfter(s.getMaxColumns(), need - s.getMaxColumns()); s.getRange(1, 1, 1, need).setValues([SH[name]]); }
    }
    return s;
  }
  if (name === 'users' || name === 'settings') throw E_('setup', '서버 준비가 안 됐어요. 개발자에게 setup 실행을 요청해 주세요.');
  s = ss.insertSheet(TITLE[name]);                                         // 새 버전에서 생긴 탭은 setup 을 안 돌려도 저절로 만듦
  var cols = SH[name].length;
  s.getRange(1, 1, Math.max(s.getMaxRows(), 2), cols).setNumberFormat('@');
  s.getRange(1, 1, 1, cols).setValues([SH[name]]);
  if (s.setFrozenRows) s.setFrozenRows(1);
  return s;
}
function rows_(name) {
  if (!ROWS_[name]) { var s = sheetGet_(name), n = s.getLastRow(); ROWS_[name] = n < 2 ? [] : s.getRange(2, 1, n - 1, SH[name].length).getValues(); }
  return ROWS_[name].slice();
}
function append_(name, row) {
  var s = sheet_(name), r = Math.max(s.getLastRow(), 1) + 1;
  if (r > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), Math.max(r - s.getMaxRows(), 200));
  var rng = s.getRange(r, 1, 1, SH[name].length); rng.setNumberFormat('@'); rng.setValues([row]);
  delete ROWS_[name];
  return r;
}
function setRow_(name, r, row) { sheet_(name).getRange(r, 1, 1, SH[name].length).setValues([row]); delete ROWS_[name]; }
function rewrite_(name, keep) {
  var s = sheet_(name), n = s.getLastRow();
  if (n < 2) return 0;
  var all = s.getRange(2, 1, n - 1, SH[name].length).getValues(), out = [];
  for (var i = 0; i < all.length; i++) if (keep(all[i])) out.push(all[i]);
  if (out.length === all.length) return 0;
  s.getRange(2, 1, n - 1, SH[name].length).clearContent();
  if (out.length) { var rng = s.getRange(2, 1, out.length, SH[name].length); rng.setNumberFormat('@'); rng.setValues(out); }
  delete ROWS_[name];
  return all.length - out.length;
}
function log_(nick, act, info) { try { append_('log', [Date.now(), nick || '', act, String(info || '').slice(0, 300)]); } catch (e) { /* 무시 */ } }
function settings_() { var o = {}, r = rows_('settings'); for (var i = 0; i < r.length; i++) o[String(r[i][0])] = String(r[i][1]); return o; }
function setSetting_(key, val) {
  cache_().remove('cfg');
  var s = sheet_('settings'), n = s.getLastRow();
  if (n >= 2) { var ks = s.getRange(2, 1, n - 1, 1).getValues(); for (var i = 0; i < ks.length; i++) if (String(ks[i][0]) === key) { s.getRange(i + 2, 2).setValue(val); return; } }
  append_('settings', [key, val]);
}
function delSettings_(prefix) { cache_().remove('cfg'); rewrite_('settings', function (r) { return String(r[0]).indexOf(prefix) !== 0; }); }

/* ───────────── 캐시 ───────────── */

function cache_() { return CacheService.getScriptCache(); }
function cget_(k) { var v = cache_().get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function cput_(k, o, sec) { try { cache_().put(k, JSON.stringify(o), sec || 21600); } catch (e) { /* 너무 크면 캐시 안 함 */ } }
function cfg_() {
  var c = cget_('cfg'); if (c) return c;
  var all = settings_(), o = {};
  for (var k in PAY_DEFAULTS) o[k] = PAY_DEFAULTS[k];
  for (var k2 in all) if (k2.indexOf('logo_') !== 0 || k2 === 'logo_ver') o[k2] = all[k2];
  cput_('cfg', o, 300);
  return o;
}

/* ───────────── 매장 ───────────── */

function branchOf_(r) { return { code: str_(r[0]), name: str_(r[1]), active: num_(r[2]) ? 1 : 0, order: num_(r[3]), created: num_(r[4]) }; }
function branches_() {
  var c = cget_('branches'); if (c) return c;
  var l = rows_('branches').map(branchOf_).filter(function (b) { return b.code; });
  l.sort(function (a, b) { return (a.order - b.order) || (a.created - b.created); });
  cput_('branches', l, 600);
  return l;
}
function findBranch_(code) { code = String(code || '').toLowerCase(); var l = branches_(); for (var i = 0; i < l.length; i++) if (l[i].code === code) return l[i]; return null; }
function branchName_(code) { var b = findBranch_(code); return b ? b.name : String(code || ''); }
function firstBranch_() { var l = branches_().filter(function (b) { return b.active; }); return l.length ? l[0].code : BRANCH; }
/** 이번 요청의 매장: 화면이 보낸 매장 → 마지막에 쓴 매장 → 기본 매장. 닫힌 매장은 관리자만 */
function pickBranch_(u, want) {
  var list = [want, u.lastBr, u.home, firstBranch_()];
  for (var i = 0; i < list.length; i++) { var b = list[i] && findBranch_(list[i]); if (b && (b.active || u.kind === 'admin')) return b.code; }
  return firstBranch_();
}
function branchList_(admin) { return branches_().filter(function (b) { return admin || b.active; }).map(function (b) { return { code: b.code, name: b.name, active: b.active }; }); }

/* ───────────── 회원 ───────────── */

function userOf_(r, i) {
  return {
    nick: str_(r[0]), kind: str_(r[1]), start: str_(r[2]), end: str_(r[3]), hash: str_(r[4]), salt: str_(r[5]),
    must: num_(r[6]), active: num_(r[7]), fail: num_(r[8]), lock: num_(r[9]), created: num_(r[10]), last: num_(r[11]),
    ext: num_(r[12]), seen: num_(r[13]), uid: str_(r[14]), home: str_(r[15]), homeAt: num_(r[16]), nickAt: num_(r[17]),
    prev: str_(r[18]), prevUntil: num_(r[19]), lastBr: str_(r[20]), lockN: num_(r[21]), plen: num_(r[22]) || 4,
    src: str_(r[23]) || 'staff', dev: str_(r[24]), ref: str_(r[25]), refPay: str_(r[26]), row: i + 2
  };
}
function userRow_(u) {
  return [u.nick, u.kind, u.start, u.end, u.hash, u.salt, u.must, u.active, u.fail, u.lock, u.created, u.last, u.ext || 0, u.seen || 0,
    u.uid, u.home || '', u.homeAt || 0, u.nickAt || 0, u.prev || '', u.prevUntil || 0, u.lastBr || '', u.lockN || 0, u.plen || 4,
    u.src || 'staff', u.dev || '', u.ref || '', u.refPay || ''];
}
function users_() { return rows_('users').map(userOf_); }
function findUser_(nick) { var k = nickKey_(nick), all = users_(); for (var i = 0; i < all.length; i++) if (nickKey_(all[i].nick) === k) return all[i]; return null; }
function userByUid_(uid) { var all = users_(); for (var i = 0; i < all.length; i++) if (all[i].uid === String(uid)) return all[i]; return null; }
function nickMap_() { var m = {}; users_().forEach(function (u) { m[u.uid] = u.nick; }); return m; }
function nickOf_(uid, map) { map = map || nickMap_(); return map[uid] || (String(uid || '').charAt(0) === 'u' && /^u\d+$/.test(uid) ? '(탈퇴한 회원)' : String(uid || '')); }
/** 닉네임을 쓸 수 있는지: 지금 누가 쓰고 있거나, 최근에 바꾼 사람의 예전 이름(7일 보호)이면 안 됨 */
function nickTaken_(nick, exceptUid) {
  var k = nickKey_(nick), now = Date.now(), all = users_();
  for (var i = 0; i < all.length; i++) {
    var u = all[i]; if (u.uid === exceptUid) continue;
    if (nickKey_(u.nick) === k) return '이미 쓰고 있는 닉네임이에요.';
    if (u.prev && nickKey_(u.prev) === k && u.prevUntil > now) return '최근에 다른 분이 쓰던 닉네임이라 ' + Utilities.formatDate(new Date(u.prevUntil), TZ, 'M월 d일') + '부터 쓸 수 있어요.';
  }
  return '';
}
function newUid_() { var n = num_(settings_().uidSeq) + 1; setSetting_('uidSeq', n); return 'u' + n; }
function saveUser_(u) { setRow_('users', u.row, userRow_(u)); }
function isStaff_(u) { return u.kind === 'admin' || u.kind === 'op'; }
function statusOf_(u) { if (isStaff_(u)) return u.kind; var t = today_(); if (u.start && t < u.start) return 'wait'; if (!u.end || t > u.end) return 'expired'; return 'active'; }
function canWrite_(st) { return st === 'admin' || st === 'op' || st === 'active'; }
function canRead_(st) { return canWrite_(st); }
function canReg_(u, st) { return isStaff_(u) || ((u.kind === 'month' || u.kind === 'year') && st === 'active'); }
function leftDays_(u) { return !isStaff_(u) && u.end ? diffDays_(today_(), u.end) : null; }
function canPay_(u) {
  if (isStaff_(u)) return { ok: false, why: '운영자·관리자는 결제하지 않아요.' };
  var st = statusOf_(u), left = leftDays_(u);
  if (u.kind === 'trial' || st === 'expired') return { ok: true };
  if (left !== null && left <= LIM.renewDays) return { ok: true };
  return { ok: false, why: '종료 ' + LIM.renewDays + '일 전부터 다시 결제할 수 있어요. (지금 D-' + left + ')', from: addDays_(u.end, -LIM.renewDays) };
}
function nextAt_(ts, days) { return ts ? ts + days * 86400000 : 0; }
function userInfo_(u) {
  var st = statusOf_(u), now = Date.now();
  return { uid: u.uid, nick: u.nick, kind: u.kind, kindName: KIND_NAME[u.kind] || u.kind, st: st, start: u.start, end: u.end, left: leftDays_(u), must: u.must ? 1 : 0, ext: u.ext || 0,
    home: u.home, homeName: branchName_(u.home), lastBr: u.lastBr || u.home, pinLen: pinLen_(u), prev: u.prevUntil > now ? u.prev : '',
    nickNext: nextAt_(u.nickAt, LIM.nickEveryDays) > now ? nextAt_(u.nickAt, LIM.nickEveryDays) : 0,
    homeNext: !isStaff_(u) && nextAt_(u.homeAt, LIM.homeEveryDays) > now ? nextAt_(u.homeAt, LIM.homeEveryDays) : 0 };
}

/* ───────────── 로그인 ───────────── */

function newSession_(u, dev) {
  var t = rand_(48), th = sha_(t), exp = Date.now() + LIM.sessionDays * 86400000;
  append_('sessions', [th, u.uid, exp, String(dev || '').slice(0, 60), Date.now()]);
  cput_('s:' + th, { n: u.uid, e: exp });
  return t;
}
function session_(t) {
  if (!t) throw E_('auth', '다시 로그인해 주세요.');
  var th = sha_(t), s = cget_('s:' + th);
  if (!s) {
    var r = rows_('sessions');
    for (var i = 0; i < r.length; i++) if (eq_(r[i][0], th)) { s = { n: str_(r[i][1]), e: num_(r[i][2]) }; break; }
    if (s) cput_('s:' + th, s);
  }
  if (!s || s.e < Date.now()) throw E_('auth', '로그인 기간이 끝났어요. 다시 로그인해 주세요.');
  var u = userByUid_(s.n);
  if (!u || !u.active) throw E_('auth', '이 계정은 지금 쓸 수 없어요. 운영자에게 문의해 주세요.');
  var st = statusOf_(u);
  if (st === 'wait') throw E_('auth', '이용 시작일 전이에요.');
  if (s.e - Date.now() < LIM.extendLeftDays * 86400000) {
    var all = rows_('sessions');
    for (var j = 0; j < all.length; j++) if (eq_(all[j][0], th)) { var ne = Date.now() + LIM.sessionDays * 86400000; sheet_('sessions').getRange(j + 2, 3).setValue(ne); cput_('s:' + th, { n: s.n, e: ne }); break; }
  }
  return { u: u, st: st, th: th };
}
function dropSessions_(uid, exceptTh) {
  rewrite_('sessions', function (r) { if (str_(r[1]) === uid && String(r[0]) !== exceptTh) { cache_().remove('s:' + String(r[0])); return false; } return true; });
  if (!exceptTh) freeSeat_(uid);
}
function purgeSessions_() { var now = Date.now(); rewrite_('sessions', function (r) { if (num_(r[2]) < now) { cache_().remove('s:' + String(r[0])); return false; } return true; }); }

/* ───────────── 동시 사용 좌석과 대기열 ───────────── */

function prune_(seats, queue, now) { for (var k in seats) if (now - seats[k] > LIM.idleMs) delete seats[k]; return queue.filter(function (x) { return now - x.ts <= LIM.queueStaleMs && !seats[x.k]; }); }
function touchSeen_(u, now) {
  var k = u.uid, last = num_(cache_().get('seen:' + k));
  if (now - last < LIM.touchMs) return;
  cache_().put('seen:' + k, String(now), 21600);
  if (now - (u.seen || 0) > LIM.seenSaveMs) { try { sheet_('users').getRange(u.row, 14).setValue(now); u.seen = now; } catch (e) { /* 무시 */ } }
}
function seat_(u) {
  var now = Date.now(); touchSeen_(u, now);
  if (isStaff_(u)) return;
  var cap = num_(cfg_().seats), k = u.uid, seats = cget_('seats') || {};
  if (seats[k] && now - seats[k] < LIM.touchMs) return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    seats = cget_('seats') || {};
    var queue = prune_(seats, cget_('queue') || [], now), used = Object.keys(seats).length;
    if (seats[k] || !cap || (used < cap && (!queue.length || queue[0].k === k))) { seats[k] = now; queue = queue.filter(function (x) { return x.k !== k; }); cput_('seats', seats); cput_('queue', queue); return; }
    var at = -1;
    for (var i = 0; i < queue.length; i++) if (queue[i].k === k) { queue[i].ts = now; at = i; }
    if (at < 0) { queue.push({ k: k, ts: now }); at = queue.length - 1; }
    cput_('queue', queue);
    throw E_('queue', '지금 이용하는 분이 많아요. 잠시만 기다려 주세요.', { pos: at + 1, ahead: at, waiting: queue.length, cap: cap });
  } finally { lock.releaseLock(); }
}
function freeSeat_(uid) { var seats = cget_('seats') || {}, queue = cget_('queue') || []; delete seats[uid]; cput_('seats', seats); cput_('queue', queue.filter(function (x) { return x.k !== uid; })); cache_().remove('seen:' + uid); }
function seatStat_() { var now = Date.now(), seats = cget_('seats') || {}, queue = prune_(seats, cget_('queue') || [], now); return { used: Object.keys(seats).length, cap: num_(cfg_().seats), waiting: queue.length }; }

/* ───────────── 공개·로그인 ───────────── */

function aCfg(q) {
  var c = cfg_(), ver = num_(c.logo_ver), b = findBranch_(q.br) || findBranch_(firstBranch_());
  var jc = joinCfg_();
  var out = { ok: true, service: SERVICE, branch: b ? b.code : '', store: b ? b.name : '', branches: branchList_(false), logoVer: ver, today: today_(),
    join: { on: jc.on, trialDays: LIM.trialDays, refOn: jc.refOn, refDays: jc.refDays } };
  if (ver && Number(q.lv) !== ver) { var s = settings_(); out.logos = { dark: joinLogo_(s, 'dark'), light: joinLogo_(s, 'light') }; }
  return out;
}
function joinLogo_(s, slot) { var out = '', i = 0; while (s['logo_' + slot + '_' + i] !== undefined) { out += s['logo_' + slot + '_' + i]; i++; } return out || null; }

/** 로그인 시도 수 제한: 서버 전체 1분당, 닉네임별 10분당(없는 닉네임도 셈) */
function loginRate_(nick) {
  var c = cache_(), m = 'lr:' + Math.floor(Date.now() / 60000), n = num_(c.get(m)) + 1;
  c.put(m, String(n), 120);
  if (n > LIM.loginPerMin) throw E_('busy', '지금 로그인하는 분이 많아요. 1분 뒤에 다시 해 주세요.');
  var k = 'ln:' + nickKey_(nick), j = num_(c.get(k)) + 1;
  c.put(k, String(j), 600);
  if (j > LIM.loginPerNick) throw E_('lock', '이 닉네임으로 너무 많이 시도했어요. 10분 뒤에 다시 해 주세요.', { min: 10 });
}
function aLogin(q) {
  var nick = normNick_(q.nick), pin = String(q.pin === undefined ? '' : q.pin);
  if (!nick || !/^\d{4,6}$/.test(pin)) throw E_('bad', '닉네임과 비밀번호 숫자를 넣어 주세요.');
  loginRate_(nick);
  var u = findUser_(nick), now = Date.now();
  if (!u) {
    hashPin_(pin, 'x');
    var moved = users_().filter(function (x) { return x.prev && nickKey_(x.prev) === nickKey_(nick) && x.prevUntil > now; })[0];
    if (moved) throw E_('login', '이 닉네임은 최근에 바뀌었어요. 바뀐 새 닉네임으로 들어와 주세요.');
    throw E_('login', '닉네임이나 비밀번호가 맞지 않아요.');
  }
  if (!u.active) throw E_('off', '이용이 중지된 계정이에요. 운영자에게 문의해 주세요.');
  if (u.lock > now) { var min = Math.ceil((u.lock - now) / 60000); throw E_('lock', '비밀번호를 여러 번 틀려서 ' + (min >= 120 ? Math.ceil(min / 60) + '시간' : min + '분') + ' 동안 쉬어요. 급하면 운영자에게 말씀해 주세요.', { min: min }); }
  if (!eq_(hashPin_(pin, u.salt), u.hash)) {
    u.fail += 1;
    var left = LIM.failMax - u.fail, lockMin = 0;
    if (left <= 0) { lockMin = LIM.lockSteps[Math.min(u.lockN || 0, LIM.lockSteps.length - 1)]; u.lock = now + lockMin * 60000; u.fail = 0; u.lockN = (u.lockN || 0) + 1; }
    saveUser_(u); log_(u.nick, '로그인 실패', lockMin ? '잠금 ' + lockMin + '분' : '');
    if (lockMin) throw E_('lock', '비밀번호를 ' + LIM.failMax + '번 틀려서 ' + (lockMin >= 60 ? lockMin / 60 + '시간' : lockMin + '분') + ' 동안 쉬어요.', { min: lockMin });
    throw E_('login', '닉네임이나 비밀번호가 맞지 않아요. (' + left + '번 더 틀리면 잠시 쉬어요)', { left: left });
  }
  if (statusOf_(u) === 'wait') throw E_('wait', '이용 시작일(' + u.start + ')이 아직 안 됐어요.');
  u.fail = 0; u.lock = 0; u.lockN = 0; u.last = now;
  if (isStaff_(u) && (u.plen || 4) < 6) u.must = 1;                       // 운영자·관리자는 6자리로 바꾸게
  saveUser_(u);
  var token = newSession_(u, q.dev);
  log_(u.nick, '로그인', '');
  return { ok: true, token: token, user: userInfo_(u), branches: branchList_(u.kind === 'admin') };
}
/* ───────────── 직접 체험 가입 (로그인 화면) ─────────────
 * 닉네임 + 기본 매장 + 비밀번호 4자리로 바로 체험회원이 됩니다. 운영자가 만들어 주는 방법도 그대로예요.
 * 악용 막기: 한 휴대폰 30일에 1번, 서버 전체 1시간·하루 한도, 관리자가 끌 수 있음. */
function joinCfg_() {
  var c = cfg_();
  return { on: String(c.join_mode || 'on') !== 'off', perDay: num_(c.join_per_day) || 100, refOn: String(c.ref_on === undefined ? '1' : c.ref_on) === '1', refDays: num_(c.ref_days) || 7 };
}
function devHash_(dev) { return sha_('dev:' + dev + ':' + pepper_()).slice(0, 24); }
function aJoinCheck(q) {
  var c = cache_(), m = 'jc:' + Math.floor(Date.now() / 60000), n = num_(c.get(m)) + 1; c.put(m, String(n), 120);
  if (n > 600) throw E_('busy', '잠시 뒤에 다시 해 주세요.');
  var nick = normNick_(q.nick);
  if (!okNick_(nick)) return { ok: true, res: { code: 'nick', msg: '한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)' } };
  var why = nickTaken_(nick, '') || (nickKey_(nick) === nickKey_(ADMIN_NICK) ? '쓸 수 없는 닉네임이에요.' : '');
  return { ok: true, res: why ? { code: 'dupnick', msg: why } : null };
}
/** 초대 링크로 들어왔을 때 "○○님의 초대" 이름 보여 주기 */
function aRefName(q) {
  var c = cache_(), m = 'jc:' + Math.floor(Date.now() / 60000), n = num_(c.get(m)) + 1; c.put(m, String(n), 120);
  if (n > 600) throw E_('busy', '잠시 뒤에 다시 해 주세요.');
  var r = /^u\d{1,9}$/.test(String(q.ref || '')) ? userByUid_(String(q.ref)) : null;
  return { ok: true, nick: r && r.active && !isStaff_(r) ? r.nick : '' };   // 운영진 이름은 보여 주지 않음
}
function aJoin(q) {
  var jc = joinCfg_(), now = Date.now();
  if (!jc.on) throw E_('off', '지금은 직접 가입을 받지 않아요. 매장 운영자에게 계정을 만들어 달라고 해 주세요.');
  var nick = normNick_(q.nick), pin = String(q.pin === undefined ? '' : q.pin), dev = String(q.dev || '');
  if (!okNick_(nick)) throw E_('nick', '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)');
  var why = nickTaken_(nick, '') || (nickKey_(nick) === nickKey_(ADMIN_NICK) ? '쓸 수 없는 닉네임이에요.' : '');
  if (why) throw E_('dupnick', why);
  var b = findBranch_(q.br); if (!b || !b.active) throw E_('branch', '기본 매장을 골라 주세요.');
  if (!/^\d{4}$/.test(pin)) throw E_('bad', '비밀번호 숫자 4자리를 정해 주세요.');
  if (weakPin_(pin)) throw E_('weak', '너무 쉬운 번호예요. (같은 숫자 반복, 1234 같은 연속 번호는 쓸 수 없어요) 다른 숫자로 정해 주세요.');
  if (!q.agree) throw E_('bad', '안내를 읽고 동의에 체크해 주세요.');
  if (!/^[a-f0-9]{16,64}$/.test(dev)) throw E_('dev', '이 화면에서는 가입할 수 없어요. 휴대폰 기본 브라우저로 열어 주세요.');
  var dh = devHash_(dev), all = users_();
  var same = all.filter(function (u) { return u.src === 'self' && u.dev === dh && now - u.created < LIM.joinDevDays * 86400000; })[0];
  if (same) throw E_('dev', '이 휴대폰으로 최근에 "' + same.nick + '" 닉네임으로 체험 가입을 했어요. 체험은 한 사람당 한 번이에요. 그 닉네임으로 로그인해 주세요.', { nick: same.nick });
  var day = all.filter(function (u) { return u.src === 'self' && now - u.created < 86400000; }).length;
  var hk = 'jh:' + Math.floor(now / 3600000), hour = num_(cache_().get(hk));
  if (day >= jc.perDay || hour >= LIM.joinPerHour) throw E_('busy', '지금은 가입 신청이 많아서 잠시 마감됐어요. 조금 뒤에 다시 하시거나 매장 운영자에게 말씀해 주세요.');
  cache_().put(hk, String(hour + 1), 3700);
  var ref = '', rr = q.ref ? userByUid_(String(q.ref)) : null;
  if (rr && rr.active && rr.dev !== dh) ref = rr.uid;                          // 같은 휴대폰끼리 추천은 인정 안 함
  var t = today_(), salt = rand_(16);
  var u = { nick: nick, kind: 'trial', start: t, end: addDays_(t, LIM.trialDays - 1), hash: hashPin_(pin, salt), salt: salt, must: 0, active: 1, fail: 0, lock: 0, created: now, last: now, ext: 0, seen: now,
    uid: newUid_(), home: b.code, homeAt: 0, nickAt: 0, prev: '', prevUntil: 0, lastBr: b.code, lockN: 0, plen: 4, src: 'self', dev: dh, ref: ref, refPay: '' };
  append_('users', userRow_(u));
  log_(nick, '직접 가입', b.name + (ref ? ' · 추천 ' + rr.nick : ''));
  var nu = findUser_(nick);
  return { ok: true, token: newSession_(nu, q.ua), user: userInfo_(nu), branches: branchList_(false) };
}
/** 친구 초대: 내 초대 링크 코드와 초대한 친구 목록(가입·결제·받은 날) */
function aRefInfo(q, ctx) {
  var me = ctx.u, jc = joinCfg_();
  var list = users_().filter(function (u) { return u.ref === me.uid; }).map(function (u) {
    var d = u.refPay ? num_(u.refPay.split('|')[1]) : 0;
    return { nick: u.nick, created: u.created, paid: d ? 1 : 0, days: d, homeName: branchName_(u.home) };
  });
  list.sort(function (a, b) { return b.created - a.created; });
  return { ok: true, code: me.uid, home: me.home, on: jc.refOn, days: jc.refDays, staff: isStaff_(me) ? 1 : 0, friends: list,
    total: list.reduce(function (s, x) { return s + x.days; }, 0) };
}
/** 추천 보상: 초대받은 친구가 처음 월간·연간을 결제(승인)하면 초대한 회원에게 +N일. 그 결제를 환불하면 다시 뺌 */
function reward_(u, p) {
  var jc = joinCfg_();
  if (!jc.refOn || !u.ref || u.refPay) return null;
  var r = userByUid_(u.ref); if (!r || !r.active || isStaff_(r)) { u.refPay = p.id + '|0'; saveUser_(u); return null; }
  var t = today_(), base = r.end && r.end >= t ? r.end : addDays_(t, -1);
  if (!r.start || r.start > t) r.start = r.start && r.start <= base ? r.start : t;
  r.end = addDays_(base, jc.refDays); saveUser_(r);
  u.refPay = p.id + '|' + jc.refDays; saveUser_(u);
  log_(r.nick, '추천 보상', u.nick + ' 결제 → +' + jc.refDays + '일 (' + r.end + '까지)');
  return { nick: r.nick, days: jc.refDays, end: r.end };
}
function unreward_(u, p) {
  if (!u || !u.refPay || u.refPay.split('|')[0] !== p.id) return null;
  var d = num_(u.refPay.split('|')[1]), r = userByUid_(u.ref);
  u.refPay = ''; saveUser_(u);
  if (r && d && r.end) { r.end = addDays_(r.end, -d); saveUser_(r); log_(r.nick, '추천 보상 취소', u.nick + ' 환불 → -' + d + '일'); }
  return { days: d };
}
function myPending_(uid) { var r = rows_('payments'); for (var i = r.length - 1; i >= 0; i--) if (str_(r[i][1]) === uid && str_(r[i][6]) === 'pending') return payOf_(r[i], i); return null; }
function aMe(q, ctx) {
  var u = ctx.u, p = myPending_(u.uid);
  return { ok: true, user: userInfo_(u), br: ctx.br, store: branchName_(ctx.br), branches: branchList_(u.kind === 'admin'), today: today_(), pay: canPay_(u), pending: p ? payView_(p) : null,
    trust: trustMap_()[u.uid] || 0, qnaOn: qnaOn_(u), qna: qnaBadge_(u), notices: noticeHeads_(ctx.br), refund: refundState_(u) };
}
function aPing() { return { ok: true }; }
function aLogout(q, ctx) { rewrite_('sessions', function (r) { return !eq_(r[0], ctx.th); }); cache_().remove('s:' + ctx.th); freeSeat_(ctx.u.uid); return { ok: true }; }
function aPin(q, ctx) {
  var u = ctx.u, len = pinLen_(u), pin = String(q.pin === undefined ? '' : q.pin);
  if (!new RegExp('^\\d{' + len + '}$').test(pin)) throw E_('bad', '숫자 ' + len + '자리로 정해 주세요.');
  if (weakPin_(pin)) throw E_('weak', '너무 쉬운 번호예요. (같은 숫자 반복, 1234 같은 연속 번호는 쓸 수 없어요) 다른 숫자로 정해 주세요.');
  u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 0; u.fail = 0; u.lock = 0; u.plen = len;
  saveUser_(u);
  if (q.others) dropSessions_(u.uid, ctx.th);                              // 다른 폰은 모두 로그아웃
  log_(u.nick, '비밀번호 변경', '');
  return { ok: true, user: userInfo_(u) };
}
/** 닉네임 바꾸기: 전체에서 중복 불가, 7일에 1번, 예전 이름은 7일 동안 다른 사람이 못 씀 */
function aSetNick(q, ctx) {
  var u = ctx.u, nick = normNick_(q.nick), now = Date.now();
  if (!okNick_(nick)) throw E_('nick', '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)');
  if (nickKey_(nick) === nickKey_(u.nick)) { if (nick === u.nick) throw E_('nick', '지금 쓰는 닉네임과 같아요.'); }
  else { var why = nickTaken_(nick, u.uid); if (why) throw E_('dupnick', why); }
  if (u.nickAt && now - u.nickAt < LIM.nickEveryDays * 86400000) throw E_('soon', '닉네임은 ' + LIM.nickEveryDays + '일에 한 번 바꿀 수 있어요. ' + Utilities.formatDate(new Date(u.nickAt + LIM.nickEveryDays * 86400000), TZ, 'M월 d일 H시') + '부터 바꿀 수 있어요.');
  if (myPending_(u.uid)) throw E_('pending', '입금 확인을 기다리는 중에는 닉네임을 바꿀 수 없어요. (송금할 때 적은 닉네임과 달라지지 않게)');
  if (u.kind === 'admin' && nickKey_(u.nick) === nickKey_(ADMIN_NICK)) throw E_('perm', '처음 관리자 계정의 닉네임은 바꿀 수 없어요.');
  var old = u.nick;
  if (nickKey_(nick) !== nickKey_(old)) { u.prev = old; u.prevUntil = now + LIM.nickProtectDays * 86400000; }
  u.nick = nick; u.nickAt = now;
  saveUser_(u);
  log_(nick, '닉네임 변경', old + ' → ' + nick);
  return { ok: true, user: userInfo_(u) };
}
/** 기본 매장 바꾸기(회원 30일에 1번). 운영자의 소속 매장은 관리자만 바꿈 */
function aSetHome(q, ctx) {
  var u = ctx.u, b = findBranch_(q.br), now = Date.now();
  if (!b || !b.active) throw E_('branch', '고를 수 없는 매장이에요.');
  if (u.kind === 'op') throw E_('perm', '운영자의 소속 매장은 관리자가 바꿔요.');
  if (b.code === u.home) return { ok: true, user: userInfo_(u) };
  if (u.kind !== 'admin' && u.homeAt && now - u.homeAt < LIM.homeEveryDays * 86400000) throw E_('soon', '기본 매장은 ' + LIM.homeEveryDays + '일에 한 번 바꿀 수 있어요. ' + Utilities.formatDate(new Date(u.homeAt + LIM.homeEveryDays * 86400000), TZ, 'M월 d일') + '부터 바꿀 수 있어요.');
  var old = u.home; u.home = b.code; u.homeAt = now; saveUser_(u);
  log_(u.nick, '기본 매장 변경', branchName_(old) + ' → ' + b.name);
  return { ok: true, user: userInfo_(u) };
}
/** 지금 쓰는 매장 기억(다음 로그인 때 그 매장으로) */
function aUseBranch(q, ctx) {
  var u = ctx.u;
  if (u.lastBr !== ctx.br) { u.lastBr = ctx.br; sheet_('users').getRange(u.row, 21).setValue(ctx.br); }
  return { ok: true, br: ctx.br, store: branchName_(ctx.br) };
}

/* ───────────── 코스 이름 규칙 ───────────── */

function normName_(s) { return String(s === undefined || s === null ? '' : s).replace(/[\s　​﻿]+/g, ''); }
function nameKey_(s) { return normName_(s).toLowerCase(); }
function okCourseName_(n) { return /^[^=+\-@<>"'`\\][^<>"'`\\]{1,29}$/.test(n); }
function splitCombo_(name) { var m = /^(.*?[^A-Za-z])([A-Z]{1,2})$/.exec(name); return m ? { base: m[1], combo: m[2] } : { base: name, combo: '' }; }
function lev1_(a, b) {
  if (a === b) return true;
  var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return d + (la - i) + (lb - j) <= 1;
}
function abbrevOf_(short, long) {
  if (short.length < 2 || short.length >= long.length) return false;
  if (long.indexOf(short) === 0) return true;
  var i = 0; for (var j = 0; j < long.length && i < short.length; j++) if (long[j] === short[i]) i++;
  return i === short.length && short[0] === long[0];
}
function commonPrefix_(a, b) { var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
function nameCheck_(name, list, exceptId, confirm) {
  var key = nameKey_(name), sp = splitCombo_(normName_(name)), bk = sp.base.toLowerCase();
  for (var i = 0; i < list.length; i++) { var c = list[i]; if (c.id === exceptId) continue; if (c.key === key) return { code: 'dup', msg: '이미 등록된 코스예요. 새로 등록할 수 없고, 그 코스에 내 기록을 넣으시면 돼요.', id: c.id, name: c.name }; }
  if (sp.combo) {
    for (var j = 0; j < list.length; j++) {
      var d = list[j]; if (d.id === exceptId) continue;
      var dp = splitCombo_(d.name), db = dp.base.toLowerCase();
      if (!dp.combo || db === bk) continue;
      var digitsDiffer = bk.replace(/\D/g, '') !== db.replace(/\D/g, '');
      if (!digitsDiffer && (abbrevOf_(bk, db) || (bk.length >= 3 && lev1_(bk, db)))) {
        var sug = dp.base + sp.combo;
        for (var x = 0; x < list.length; x++) if (list[x].key === nameKey_(sug) && list[x].id !== exceptId) return { code: 'dup', msg: '"' + list[x].name + '" 코스가 이미 있어요. 그 코스에 내 기록을 넣으시면 돼요.', id: list[x].id, name: list[x].name };
        return { code: 'suggest', msg: '"' + sug + '"로 등록할까요? (이미 "' + d.name + '"이 있어요)', suggest: sug, id: d.id, name: d.name };
      }
    }
    return null;
  }
  if (!confirm) for (var y = 0; y < list.length; y++) { var e = list[y]; if (e.id === exceptId) continue; if (commonPrefix_(key, e.key) >= 4) return { code: 'similar', msg: '비슷한 코스가 있어요: "' + e.name + '". 같은 구장의 다른 조합이 맞나요?', id: e.id, name: e.name }; }
  return null;
}

/* ───────────── 코스·기록 (코스는 전체 공통, 기록은 매장별) ───────────── */

function courseOf_(r, i) {
  var holes = []; try { holes = JSON.parse(str_(r[4])); } catch (e) { holes = []; }
  return { id: str_(r[0]), name: str_(r[1]), key: str_(r[2]), reg: str_(r[3]), holes: holes, created: num_(r[5]), upd: num_(r[6]), updBy: str_(r[7]), stage: str_(r[8]) || 'done', row: i + 2 };
}
function courses_() { var c = cget_('courses'); if (c) return c; var list = rows_('courses').map(courseOf_); cput_('courses', list, 600); return list; }
function dropCourseCache_() { cache_().remove('courses'); }
function findCourse_(id) { var all = courses_(); for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i]; return null; }
function mineCourse_(c, u) { return c.reg === u.uid; }
function canSeeCourse_(c, u) { return c.stage === 'done' || mineCourse_(c, u) || u.kind === 'admin'; }
function canEditCourse_(c, u, st) { return isStaff_(u) || (canReg_(u, st) && mineCourse_(c, u)); }
function holeLbl_(i) { return i < 9 ? (i + 1) + '홀' : (i - 8) + '홀(' + (i + 1) + '홀)'; }
function cleanHalf_(h, half) {
  if (!Array.isArray(h) || h.length !== 9) throw E_('bad', '9개 홀의 파와 거리를 모두 넣어 주세요.');
  var out = [];
  for (var i = 0; i < 9; i++) {
    var par = Number(h[i] && h[i][0]), m = Math.round(Number(h[i] && h[i][1]) * 10) / 10;
    if ([3, 4, 5].indexOf(par) < 0 || !isFinite(m) || m <= 0 || m > 999.9) throw E_('bad', holeLbl_(half * 9 + i) + '의 파나 거리가 올바르지 않아요.');
    out.push([par, m]);
  }
  return out;
}
function cleanRec_(r) {
  r = r || {};
  var ref = ['f', 'c', 'u'].indexOf(r.r) >= 0 ? r.r : '';
  var n = Math.max(0, Math.min(30, Math.round(Number(r.n) || 0)));
  var clean = function (s, max) { return String(s === undefined || s === null ? '' : s).replace(/[<>]/g, '').slice(0, max); };
  var p = Math.round(Number(r.p) || 0); if (p < 8 || p > 40) p = 17;
  if (!ref) return { r: '', t: '', d: 'R', n: 0, p: 17, o: clean(r.o, 20) };
  return { r: ref, t: ref === 'u' ? clean(r.t, 10) : '', d: r.d === 'L' ? 'L' : 'R', n: n, p: p, o: clean(r.o, 20) };
}
function emptyRecs_() { var a = []; for (var i = 0; i < 18; i++) a.push({ r: '', t: '', d: 'R', n: 0, p: 17, o: '' }); return a; }
function parseRecs_(json) { var a; try { a = JSON.parse(json); } catch (e) { a = null; } var out = emptyRecs_(); if (Array.isArray(a)) for (var i = 0; i < 18; i++) if (a[i]) out[i] = cleanRec_(a[i]); return out; }
function filledOf_(recs) { var n = 0; for (var i = 0; i < recs.length; i++) if (recs[i].r) n++; return n; }
function recBr_(r) { return str_(r[5]) || BRANCH; }
function findRecRow_(cid, uid, br) {
  var s = sheet_('records'), n = s.getLastRow(); if (n < 2) return null;
  var v = s.getRange(2, 1, n - 1, 6).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === String(cid) && str_(v[i][1]) === uid && recBr_(v[i]) === br) return i + 2;
  return null;
}
function getRecs_(cid, uid, br) {
  var r = findRecRow_(cid, uid, br);
  if (!r) return { recs: emptyRecs_(), row: null, upd: 0 };
  var v = sheet_('records').getRange(r, 1, 1, 6).getValues()[0];
  return { recs: parseRecs_(str_(v[3])), row: r, upd: num_(v[4]) };
}
function putRecs_(cid, uid, br, recs) {
  var row = [String(cid), uid, filledOf_(recs), JSON.stringify(recs), Date.now(), br];
  var r = findRecRow_(cid, uid, br);
  if (r) setRow_('records', r, row); else append_('records', row);
  return row[4];
}
function visibleUids_(users) { var ok = {}; for (var i = 0; i < users.length; i++) if (users[i].active && canRead_(statusOf_(users[i]))) ok[users[i].uid] = true; return ok; }
function privateMap_() { var m = {}, r = rows_('prefs'); for (var i = 0; i < r.length; i++) if (num_(r[i][2]) === 0) m[str_(r[i][0]) + '|' + String(r[i][1])] = true; return m; }
/** 등록한 사람: 회원번호면 지금 닉네임, 예전 다른 매장에서 가져온 코스('이름@매장')는 그대로 표시 */
function regOf_(c, map) {
  var s = String(c.reg || '');
  if (s.indexOf('@') >= 0) { var p = s.split('@'); return { nick: p[0], from: p[1] || '' }; }
  return { nick: s ? nickOf_(s, map) : '', from: '' };
}
function courseView_(c, u, st, map) {
  var rg = regOf_(c, map);
  return { id: c.id, name: c.name, reg: rg.nick, regFrom: rg.from, holes: c.holes, stage: c.stage, canEdit: canEditCourse_(c, u, st), mineReg: mineCourse_(c, u) };
}
function aCourses(q, ctx) {
  var u = ctx.u, br = ctx.br, see = canRead_(ctx.st), map = nickMap_();
  var list = courses_().filter(function (c) { return canSeeCourse_(c, u); });
  var recs = rows_('records'), mine = {}, homeMine = {}, others = {}, vis = see ? visibleUids_(users_()) : {}, priv = see ? privateMap_() : {};
  for (var i = 0; i < recs.length; i++) {
    var cid = String(recs[i][0]), id = str_(recs[i][1]), f = num_(recs[i][2]), rb = recBr_(recs[i]);
    if (id === u.uid) { if (rb === br) mine[cid] = f; else if (rb === u.home) homeMine[cid] = f; }
    else if (see && rb === br && f > 0 && vis[id] && !priv[id + '|' + cid]) others[cid] = (others[cid] || 0) + 1;
  }
  return { ok: true, br: br, store: branchName_(br), canReg: canReg_(u, ctx.st),
    courses: list.map(function (c) { var v = courseView_(c, u, ctx.st, map); v.mine = mine[c.id] || 0; v.homeMine = homeMine[c.id] || 0; v.others = see ? (others[c.id] || 0) : 0; return v; }) };
}
function aCourse(q, ctx) {
  var c = findCourse_(q.id), u = ctx.u, br = ctx.br, map = nickMap_();
  if (!c || !canSeeCourse_(c, u)) throw E_('nocourse', '찾는 코스가 없어요. 지워졌을 수 있어요.');
  var out = { ok: true, br: br, store: branchName_(br), course: courseView_(c, u, ctx.st, map), mine: getRecs_(c.id, u.uid, br).recs, authors: [], pick: null, ref: null };
  if (u.home && u.home !== br) {                                            // 다른 매장에서 볼 때: 기본 매장 내 기록을 참고로(흐리게)
    var hr = getRecs_(c.id, u.uid, u.home).recs;
    if (filledOf_(hr)) out.ref = { br: u.home, store: branchName_(u.home), recs: hr };
  }
  if (!canRead_(ctx.st) || c.stage !== 'done') return out;
  var vis = visibleUids_(users_()), priv = privateMap_(), rr = rows_('records'), list = [];
  for (var i = 0; i < rr.length; i++) {
    var id = str_(rr[i][1]);
    if (String(rr[i][0]) !== c.id || recBr_(rr[i]) !== br || id === u.uid || num_(rr[i][2]) <= 0 || !vis[id] || priv[id + '|' + c.id]) continue;
    list.push({ uid: id, nick: nickOf_(id, map), filled: num_(rr[i][2]), upd: num_(rr[i][4]), json: str_(rr[i][3]) });
  }
  var tm = trustMap_();
  list.forEach(function (a) { a.trust = tm[a.uid] || 0; });
  list.sort(function (a, b) { return (b.trust - a.trust) || (b.filled - a.filled) || (b.upd - a.upd); });
  out.authors = list.map(function (a) { return { uid: a.uid, nick: a.nick, filled: a.filled, trust: a.trust }; });
  if (list.length) {
    var want = String(q.who || ''), pick = list[0];
    for (var j = 0; j < list.length; j++) if (list[j].uid === want || nickKey_(list[j].nick) === nickKey_(want)) pick = list[j];
    out.pick = { uid: pick.uid, nick: pick.nick, trust: pick.trust, recs: parseRecs_(pick.json) };
  }
  return out;
}
function aNameCheck(q) {
  var name = normName_(q.name);
  if (!okCourseName_(name)) return { ok: true, res: { code: 'name', msg: '코스 이름은 2~30자로 적어 주세요. (예: 목행충주호파크골프CD)' } };
  return { ok: true, res: nameCheck_(name, courses_(), q.except || '', !!q.confirm) };
}
function aRegFront(q, ctx) {
  var name = normName_(q.name);
  if (!okCourseName_(name)) throw E_('name', '코스 이름은 2~30자로 적어 주세요. (예: 목행충주호파크골프CD)');
  var chk = nameCheck_(name, courses_(), '', !!q.confirm);
  if (chk) throw E_(chk.code, chk.msg, { id: chk.id, name: chk.name, suggest: chk.suggest });
  var front = cleanHalf_(q.holes, 0), holes = front.concat([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
  var seq = num_(settings_().seq) + 1, id = 'c' + seq;
  setSetting_('seq', seq);
  append_('courses', [id, name, nameKey_(name), ctx.u.uid, JSON.stringify(holes), Date.now(), Date.now(), ctx.u.uid, 'front']);
  dropCourseCache_();
  saveHalfRecs_(id, ctx.u.uid, ctx.br, q.recs, 0);
  log_(ctx.u.nick, '코스 전반 등록', name);
  return { ok: true, id: id, name: name };
}
function aRegBack(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  if (!mineCourse_(c, ctx.u) && ctx.u.kind !== 'admin') throw E_('perm', '처음 등록한 분만 후반을 넣을 수 있어요.');
  if (c.stage === 'done') throw E_('done', '이미 18홀 등록이 끝난 코스예요.');
  var back = cleanHalf_(q.holes, 1), holes = c.holes.slice(0, 9).concat(back);
  setRow_('courses', c.row, [c.id, c.name, c.key, c.reg, JSON.stringify(holes), c.created, Date.now(), ctx.u.uid, 'done']);
  dropCourseCache_();
  saveHalfRecs_(c.id, ctx.u.uid, ctx.br, q.recs, 1);
  log_(ctx.u.nick, '코스 등록 완료', c.name);
  return { ok: true, id: c.id };
}
function saveHalfRecs_(cid, uid, br, recs, half) {
  if (!Array.isArray(recs)) return;
  var cur = getRecs_(cid, uid, br).recs, n = 0;
  for (var i = 0; i < 9; i++) if (recs[i] && recs[i].r) { cur[half * 9 + i] = cleanRec_(recs[i]); n++; }
  if (n) putRecs_(cid, uid, br, cur);
}
function aEditCourse(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  if (!canEditCourse_(c, ctx.u, ctx.st)) throw E_('perm', '처음 등록한 분이나 운영자·관리자만 고칠 수 있어요.');
  var name = c.name, key = c.key, holes = c.holes.slice();
  if (q.front !== undefined) { var f = cleanHalf_(q.front, 0); for (var i = 0; i < 9; i++) holes[i] = f[i]; }
  if (q.back !== undefined) { if (c.stage !== 'done') throw E_('bad', '후반은 등록을 마친 뒤에 고칠 수 있어요.'); var b = cleanHalf_(q.back, 1); for (var j = 0; j < 9; j++) holes[9 + j] = b[j]; }
  if (q.name !== undefined && normName_(q.name) !== c.name) {
    if (!isStaff_(ctx.u)) throw E_('perm', '코스 이름은 운영자·관리자만 바꿀 수 있어요.');
    name = normName_(q.name);
    if (!okCourseName_(name)) throw E_('name', '코스 이름은 2~30자로 적어 주세요.');
    var chk = nameCheck_(name, courses_(), c.id, true);
    if (chk) throw E_(chk.code, chk.msg, { id: chk.id, name: chk.name, suggest: chk.suggest });
    key = nameKey_(name);
  }
  setRow_('courses', c.row, [c.id, name, key, c.reg, JSON.stringify(holes), c.created, Date.now(), ctx.u.uid, c.stage]);
  dropCourseCache_();
  log_(ctx.u.nick, '코스 수정', c.name + (name !== c.name ? ' → ' + name : '') + ' (' + branchName_(ctx.br) + ')');
  return { ok: true };
}
function aDelCourse(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  if (ctx.u.kind !== 'admin' && !(c.stage === 'front' && mineCourse_(c, ctx.u))) throw E_('perm', '코스 지우기는 관리자만 할 수 있어요.');
  rewrite_('courses', function (r) { return String(r[0]) !== c.id; });
  rewrite_('records', function (r) { return String(r[0]) !== c.id; });
  rewrite_('prefs', function (r) { return String(r[1]) !== c.id; });
  rewrite_('uses', function (r) { return String(r[2]) !== c.id; });
  dropCourseCache_();
  log_(ctx.u.nick, '코스 삭제', c.name);
  return { ok: true };
}
function aSave(q, ctx) {
  var c = findCourse_(q.cid);
  if (!c || !canSeeCourse_(c, ctx.u)) throw E_('nocourse', '찾는 코스가 없어요. 지워졌을 수 있어요.');
  if (!Array.isArray(q.items) || !q.items.length || q.items.length > 18) throw E_('bad', '저장할 내용이 올바르지 않아요.');
  var br = ctx.br, recs = getRecs_(c.id, ctx.u.uid, br).recs;
  for (var i = 0; i < q.items.length; i++) {
    var it = q.items[i], idx = Number(it && it.i);
    if (!(idx >= 0 && idx < 18) || idx !== Math.floor(idx)) throw E_('bad', '홀 번호가 올바르지 않아요.');
    if (c.stage !== 'done' && idx >= 9) throw E_('bad', '후반을 등록한 뒤에 기록할 수 있어요.');
    recs[idx] = cleanRec_(it.rec);
  }
  var upd = putRecs_(c.id, ctx.u.uid, br, recs);
  return { ok: true, upd: upd, filled: filledOf_(recs), br: br };
}
function aPub(q, ctx) {
  var c = findCourse_(q.cid); if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  var id = ctx.u.uid, pub = q.pub ? 1 : 0;
  rewrite_('prefs', function (r) { return !(str_(r[0]) === id && String(r[1]) === c.id); });
  if (!pub) append_('prefs', [id, c.id, 0]);
  return { ok: true, pub: pub };
}
function aPrefs(q, ctx) { var r = rows_('prefs'), off = []; for (var i = 0; i < r.length; i++) if (str_(r[i][0]) === ctx.u.uid && num_(r[i][2]) === 0) off.push(String(r[i][1])); return { ok: true, off: off }; }

/* ───────────── 신뢰도 ─────────────
 * 다른 회원이 내 기록을 가져다 쓰면 1점. 같은 사람·같은 매장·같은 코스는 몇 번이든 1점(날짜만 최근으로). 점수는 매장을 합쳐서 하나. */

function trustMap_() { var m = {}, r = rows_('uses'); for (var i = 0; i < r.length; i++) { var k = str_(r[i][0]); m[k] = (m[k] || 0) + 1; } return m; }
function findUse_(owner, user, cid, br) {
  var r = rows_('uses');
  for (var i = 0; i < r.length; i++) if (str_(r[i][0]) === owner && str_(r[i][1]) === user && String(r[i][2]) === String(cid) && (str_(r[i][5]) || BRANCH) === br) return { row: i + 2, first: num_(r[i][3]), last: num_(r[i][4]) };
  return null;
}
function aUse(q, ctx) {
  var c = findCourse_(q.cid), me = ctx.u, br = ctx.br;
  if (!c || c.stage !== 'done') throw E_('nocourse', '찾는 코스가 없어요.');
  var src = userByUid_(q.from) || findUser_(q.from);
  if (!src || src.uid === me.uid) throw E_('bad', '가져온 회원을 찾을 수 없어요.');
  var vis = visibleUids_(users_()), priv = privateMap_();
  if (!vis[src.uid] || priv[src.uid + '|' + c.id] || !(getRecs_(c.id, src.uid, br).recs.some(function (r) { return r.r; }))) throw E_('bad', '이 매장·이 코스에 공개된 기록이 없는 회원이에요.');
  var now = Date.now(), had = findUse_(src.uid, me.uid, c.id, br);
  if (had) sheet_('uses').getRange(had.row, 5).setValue(now);
  else append_('uses', [src.uid, me.uid, c.id, now, now, br]);
  return { ok: true, created: !had, trust: trustMap_()[src.uid] || 0 };
}
function aUnuse(q, ctx) {
  var src = userByUid_(q.from) || findUser_(q.from); if (!src) return { ok: true, removed: 0 };
  var had = findUse_(src.uid, ctx.u.uid, q.cid, ctx.br);
  if (had && Date.now() - had.first < 30 * 60000) {
    rewrite_('uses', function (r) { return !(str_(r[0]) === src.uid && str_(r[1]) === ctx.u.uid && String(r[2]) === String(q.cid) && (str_(r[5]) || BRANCH) === ctx.br); });
    return { ok: true, removed: 1 };
  }
  return { ok: true, removed: 0 };
}
function aTrust(q, ctx) {
  var who = ctx.u;
  if (q.uid && q.uid !== who.uid) { if (!isStaff_(ctx.u)) throw E_('perm', '내 신뢰도만 볼 수 있어요.'); who = userByUid_(q.uid); if (!who) throw E_('nouser', '찾는 회원이 없어요.'); }
  else if (q.nick && nickKey_(q.nick) !== nickKey_(who.nick)) { if (!isStaff_(ctx.u)) throw E_('perm', '내 신뢰도만 볼 수 있어요.'); who = findUser_(q.nick); if (!who) throw E_('nouser', '찾는 회원이 없어요.'); }
  var names = {}, map = nickMap_(); courses_().forEach(function (c) { names[c.id] = c.name; });
  var list = rows_('uses').filter(function (r) { return str_(r[0]) === who.uid; }).map(function (r) {
    var b = str_(r[5]) || BRANCH;
    return { at: num_(r[4]), first: num_(r[3]), user: nickOf_(str_(r[1]), map), cid: str_(r[2]), course: names[str_(r[2])] || '(지워진 코스)', br: b, store: branchName_(b) };
  });
  list.sort(function (a, b) { return b.at - a.at; });
  return { ok: true, nick: who.nick, trust: list.length, list: list };
}

/* ───────────── 글자 꾸미기(문의·공지·자주 묻는 질문) ─────────────
 * 굵게(<b>), 크게(<span class="big">), 색(<span class="c-r|c-b|c-g">), 줄바꿈(<br>)만 허용 */

function cleanHtml_(h, maxText) {
  h = String(h === undefined || h === null ? '' : h).slice(0, 20000);
  var out = '', re = /<[^>]*>/g, last = 0, m, open = [];
  function text(t) { return t.replace(/&(?!(amp|lt|gt|quot|#39|nbsp);)/g, '&amp;').replace(/[<>"]/g, function (c) { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'; }); }
  while ((m = re.exec(h))) {
    out += text(h.slice(last, m.index)); last = re.lastIndex;
    var tag = m[0].toLowerCase().replace(/\s+/g, ' ');
    if (tag === '<br>' || tag === '<br/>' || tag === '<br />') out += '<br>';
    else if (tag === '<b>') { out += '<b>'; open.push('b'); }
    else if (/^<span class="(big|c-r|c-b|c-g)">$/.test(tag)) { out += tag; open.push('span'); }
    else if (tag === '</b>' || tag === '</span>') { var want = tag === '</b>' ? 'b' : 'span'; if (open.length && open[open.length - 1] === want) { open.pop(); out += tag; } }
  }
  out += text(h.slice(last));
  while (open.length) out += open.pop() === 'b' ? '</b>' : '</span>';
  out = out.replace(/^(<br>)+|(<br>)+$/g, '').replace(/(<br>){3,}/g, '<br><br>');
  var plain = plainOf_(out);
  if (!plain.replace(/\s/g, '')) throw E_('bad', '내용을 적어 주세요.');
  if (plain.length > maxText) throw E_('big', '내용은 ' + maxText + '자까지 쓸 수 있어요. (지금 ' + plain.length + '자)');
  return out;
}
function plainOf_(h) { return String(h).replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'); }
function cleanTitle_(s, max) { return String(s || '').replace(/[<>]/g, '').replace(/^\s+|\s+$/g, '').slice(0, max); }

/* ───────────── 문의하기: 자주 묻는 질문(FAQ) + 1:1 문의 ─────────────
 * 분류: pay(결제·이용권)·branch(매장 추가 요청)는 관리자만 답변. 그 밖은 그 매장 운영자도 답변. */

var QNA_CAT = { pay: '결제·이용권', course: '코스 정보 수정 요청', app: '앱 사용·오류', acct: '계정·비밀번호', branch: '매장 추가 요청', nick: '닉네임 확인 요청', etc: '기타' };
var QNA_LIM = { perDay: 5, openMax: 3, userChars: 500, staffChars: 1000, faqChars: 2000, titleChars: 30, autoCloseDays: 7, keepDays: 365 };
var FAQ_DEFAULTS = [
  ['비밀번호를 잊었어요', '기본 매장 운영자에게 말씀해 주세요. 운영자가 <b>비밀번호 다시 만들기</b>를 하면 새 처음 비밀번호를 알려 드려요. 들어온 뒤 나만의 숫자 4자리로 바꾸면 돼요.'],
  ['송금했는데 아직 이용이 시작되지 않아요', '관리자가 카카오페이 내역이나 통장에서 <b>보낸 분 표시(닉네임)</b>와 금액을 확인한 뒤 승인하면 바로 시작돼요.<br>송금 메시지에 닉네임을 적지 않았다면 <span class="c-r">결제·이용권</span> 분류로 문의를 남겨 주세요.'],
  ['다른 매장에서도 쓸 수 있나요?', '네. 이용권 하나로 <b>모든 매장</b>을 쓸 수 있어요. 위쪽 매장 이름을 누르면 매장을 바꿀 수 있어요.<br>매장마다 센서와 타격감이 달라서 <b>기록은 매장별로</b> 따로 저장돼요. 다른 매장에서는 기본 매장 내 기록이 흐리게 보여서 참고하거나 가져올 수 있어요.'],
  ['우리 매장도 넣어 주세요', '문의하기에서 <b>매장 추가 요청</b> 분류로 매장 이름과 위치를 남겨 주세요. 관리자가 확인한 뒤 매장을 만들어 드려요.'],
  ['타격감 17은 무슨 뜻인가요?', '<b>17 = 50M</b>이고, 1마다 5M씩 달라져요. 예: 16 = 45M, 18 = 55M. 기록할 때 처음부터 17이 들어 있어요.'],
  ['다른 회원 기록이 보이지 않아요', '그 매장·그 코스에 기록을 <b>공개</b>한 회원만 보여요. 이용 기간이 끝나면 내 기록만 볼 수 있어요. 이용권을 결제하면 다시 보여요.'],
  ['홈 화면 아이콘이 예전 그림이에요', '아이폰은 홈 화면에 추가한 순간의 아이콘이 그대로 남아요. 아이콘을 지우고 Safari로 다시 열어 <b>홈 화면에 추가</b>를 하면 새 아이콘으로 바뀌어요.'],
  ['체험은 어떻게 시작하나요?', '로그인 화면의 <b>5일 무료 체험 시작하기</b>를 누르고, 스크린 파크골프에서 쓰는 닉네임·자주 가는 매장·비밀번호 4자리를 정하면 바로 시작돼요. 체험은 한 사람당 한 번이에요. 매장 운영자에게 만들어 달라고 해도 돼요.'],
  ['내 닉네임을 다른 분이 쓰고 있어요', '문의하기에서 <b>닉네임 확인 요청</b>을 남겨 주세요. 관리자가 확인한 뒤 닉네임을 정리해 드려요.'],
  ['친구를 초대하면 혜택이 있나요?', '설정 → <b>친구에게 알리기</b>의 링크로 친구가 가입하고 월간·연간 이용권을 결제하면, 나에게 <b>7일</b>을 더 드려요. 친구 한 명당 한 번이에요.'],
  ['기록하는 중에 화면이 꺼져요', '코스 화면을 보는 동안에는 화면이 꺼지지 않게 해 두었어요. 그래도 꺼지면 휴대폰 <b>설정 → 화면 자동 꺼짐</b> 시간을 길게 해 주세요.']
];

function qnaMode_() { var m = String(cfg_().qna_mode || 'test'); return m === 'on' || m === 'off' ? m : 'test'; }
function qnaTesters_() { var o = {}; String(cfg_().qna_testers || '').split(/[,\s]+/).forEach(function (n) { if (n) o[nickKey_(n)] = 1; }); return o; }
function qnaOn_(u) { var m = qnaMode_(); if (m === 'off') return false; if (m === 'on' || isStaff_(u)) return true; return !!qnaTesters_()[nickKey_(u.nick)]; }
function needQna_(u) { if (!qnaOn_(u)) throw E_('off', '문의하기는 아직 준비 중이에요.'); }
function adminCat_(c) { return c === 'pay' || c === 'branch' || c === 'nick'; }
function canAnswer_(u, q) { return u.kind === 'admin' || (u.kind === 'op' && !adminCat_(q.cat) && q.br === u.home); }
function canSeeQna_(u, q) { return q.uid === u.uid || u.kind === 'admin' || (u.kind === 'op' && q.br === u.home); }
function qnaOf_(r, i) {
  var msgs = []; try { msgs = JSON.parse(str_(r[9]) || '[]'); } catch (e) { msgs = []; }
  return { id: str_(r[0]), uid: str_(r[1]), cat: str_(r[2]), cid: str_(r[3]), title: str_(r[4]), status: str_(r[5]), created: num_(r[6]), updated: num_(r[7]), lastBy: str_(r[8]), msgs: msgs, seenUser: num_(r[10]), seenStaff: num_(r[11]), meta: str_(r[12]), br: str_(r[13]) || BRANCH, row: i + 2 };
}
function qnaRow_(q) { return [q.id, q.uid, q.cat, q.cid, q.title, q.status, q.created, q.updated, q.lastBy, JSON.stringify(q.msgs), q.seenUser, q.seenStaff, q.meta || '', q.br]; }
function qnas_() { return rows_('qna').map(qnaOf_); }
function findQna_(id) { var a = qnas_(); for (var i = 0; i < a.length; i++) if (a[i].id === String(id)) return a[i]; return null; }
function qnaBadge_(u) {
  if (!qnaOn_(u)) return null;
  var n = 0;
  qnas_().forEach(function (q) {
    if (isStaff_(u) && q.uid !== u.uid) { if (q.status === 'open' && canAnswer_(u, q)) n++; }
    else if (q.uid === u.uid && q.lastBy === 'staff' && q.msgs.length > q.seenUser && q.status !== 'closed') n++;
  });
  return n;
}
function qnaView_(q, u, full, map) {
  map = map || nickMap_();
  var mine = q.uid === u.uid;
  var o = { id: q.id, uid: q.uid, nick: nickOf_(q.uid, map), mine: mine, cat: q.cat, catName: QNA_CAT[q.cat] || q.cat, cid: q.cid, title: q.title, status: q.status, created: q.created, updated: q.updated, lastBy: q.lastBy, count: q.msgs.length,
    br: q.br, store: branchName_(q.br),
    unread: mine ? (q.lastBy === 'staff' && q.msgs.length > q.seenUser) : (q.lastBy === 'user' && q.msgs.length > q.seenStaff), canAnswer: !mine && isStaff_(u) && canAnswer_(u, q) };
  if (full) { o.msgs = q.msgs.map(function (m) { return { by: nickOf_(m.by, map), byUid: m.by, role: m.role, at: m.at, html: m.html }; }); if (isStaff_(u)) o.meta = q.meta; }
  return o;
}
function aFaqList(q, ctx) {
  needQna_(ctx.u);
  var list = rows_('faq').map(function (r) { return { id: str_(r[0]), order: num_(r[1]), q: str_(r[2]), a: str_(r[3]) }; });
  list.sort(function (a, b) { return a.order - b.order; });
  return { ok: true, faq: list, canEdit: ctx.u.kind === 'admin' };
}
function aFaqSave(q, ctx) {
  var title = cleanTitle_(q.q, 60); if (!title) throw E_('bad', '질문을 적어 주세요.');
  var ans = cleanHtml_(q.ans, QNA_LIM.faqChars), all = rows_('faq');
  if (q.id) {
    for (var i = 0; i < all.length; i++) if (str_(all[i][0]) === String(q.id)) { setRow_('faq', i + 2, [str_(all[i][0]), q.order !== undefined ? num_(q.order) : num_(all[i][1]), title, ans, Date.now()]); return aFaqList(q, ctx); }
    throw E_('bad', '찾는 질문이 없어요.');
  }
  var mx = 0; all.forEach(function (r) { mx = Math.max(mx, num_(r[1])); });
  append_('faq', ['f' + Date.now().toString(36) + rand_(3), mx + 1, title, ans, Date.now()]);
  return aFaqList(q, ctx);
}
function aFaqDel(q, ctx) { rewrite_('faq', function (r) { return str_(r[0]) !== String(q.id); }); return aFaqList(q, ctx); }
function aFaqMove(q, ctx) {
  var all = rows_('faq').map(function (r, i) { return { id: str_(r[0]), order: num_(r[1]), row: i + 2 }; }).sort(function (a, b) { return a.order - b.order; });
  var at = -1; for (var i = 0; i < all.length; i++) if (all[i].id === String(q.id)) at = i;
  var to = at + (q.dir < 0 ? -1 : 1);
  if (at >= 0 && to >= 0 && to < all.length) { var t = all[at]; all[at] = all[to]; all[to] = t; }
  all.forEach(function (x, k) { sheet_('faq').getRange(x.row, 2).setValue(k + 1); });
  return aFaqList(q, ctx);
}
var FAQ_VER = 31;
function seedFaq_() {
  var st = settings_();
  if (!(sheet_('faq').getLastRow() > 1 || st.faq_seeded)) {
    FAQ_DEFAULTS.forEach(function (f, i) { append_('faq', ['f' + (i + 1), i + 1, f[0], f[1], Date.now()]); });
    setSetting_('faq_seeded', 1); setSetting_('faq_ver', FAQ_VER); return;
  }
  if (num_(st.faq_ver) >= FAQ_VER) return;                                 // 새 버전에서 늘어난 질문만 뒤에 더함(관리자가 고친 것은 그대로)
  var have = {}, mx = 0; rows_('faq').forEach(function (r) { have[str_(r[2])] = 1; mx = Math.max(mx, num_(r[1])); });
  FAQ_DEFAULTS.forEach(function (f, i) { if (!have[f[0]]) append_('faq', ['f' + Date.now().toString(36) + i, ++mx, f[0], f[1], Date.now()]); });
  setSetting_('faq_ver', FAQ_VER);
}
function aQnaList(q, ctx) {
  needQna_(ctx.u);
  var u = ctx.u, map = nickMap_(), list = qnas_().filter(function (x) { return canSeeQna_(u, x); });
  list.sort(function (a, b) { return b.updated - a.updated; });
  return { ok: true, list: list.map(function (x) { return qnaView_(x, u, false, map); }), cats: QNA_CAT, badge: qnaBadge_(u), staff: isStaff_(u) };
}
function aQnaGet(q, ctx) {
  needQna_(ctx.u);
  var x = findQna_(q.id), u = ctx.u;
  if (!x || !canSeeQna_(u, x)) throw E_('noqna', '찾는 문의가 없어요.');
  if (x.uid === u.uid) x.seenUser = x.msgs.length; else x.seenStaff = x.msgs.length;
  setRow_('qna', x.row, qnaRow_(x));
  var out = qnaView_(x, u, true);
  if (x.cat === 'pay' && isStaff_(u) && x.uid !== u.uid) { var p = myPending_(x.uid); out.pending = p ? payView_(p) : null; }
  if (x.cid) { var c = findCourse_(x.cid); out.course = c ? { id: c.id, name: c.name } : null; }
  return { ok: true, qna: out, badge: qnaBadge_(u) };
}
function aQnaAsk(q, ctx) {
  needQna_(ctx.u);
  var u = ctx.u, cat = QNA_CAT[q.cat] ? q.cat : '';
  if (!cat) throw E_('bad', '분류를 골라 주세요.');
  var title = cleanTitle_(q.title, QNA_LIM.titleChars); if (!title) throw E_('bad', '제목을 적어 주세요.');
  var body = cleanHtml_(q.html, QNA_LIM.userChars), now = Date.now(), mineAll = qnas_().filter(function (x) { return x.uid === u.uid; });
  if (!isStaff_(u)) {
    if (mineAll.filter(function (x) { return now - x.created < 86400000; }).length >= QNA_LIM.perDay) throw E_('limit', '문의는 하루 ' + QNA_LIM.perDay + '건까지 남길 수 있어요. 내일 다시 남겨 주세요.');
    if (mineAll.filter(function (x) { return x.status === 'open'; }).length >= QNA_LIM.openMax) throw E_('limit', '답변을 기다리는 문의가 ' + QNA_LIM.openMax + '건 있어요. 답변을 받은 뒤 새로 남겨 주세요.');
  }
  var cid = ''; if (q.cid) { var c = findCourse_(q.cid); if (c) cid = c.id; }
  var x = { id: 'q' + now.toString(36) + rand_(3), uid: u.uid, cat: cat, cid: cid, title: title, status: 'open', created: now, updated: now, lastBy: 'user', msgs: [{ by: u.uid, role: 'user', at: now, html: body }], seenUser: 1, seenStaff: 0, meta: cleanTitle_(q.meta, 120), br: ctx.br };
  append_('qna', qnaRow_(x));
  log_(u.nick, '문의', QNA_CAT[cat] + ' ' + title);
  return { ok: true, qna: qnaView_(x, u, true) };
}
function aQnaReply(q, ctx) {
  needQna_(ctx.u);
  var x = findQna_(q.id), u = ctx.u;
  if (!x || !canSeeQna_(u, x)) throw E_('noqna', '찾는 문의가 없어요.');
  var staffSide = x.uid !== u.uid;
  if (staffSide && !canAnswer_(u, x)) throw E_('perm', adminCat_(x.cat) ? '결제·이용권, 매장 추가, 닉네임 확인 요청은 관리자만 답변할 수 있어요.' : '다른 매장 문의에는 답변할 수 없어요.');
  var body = cleanHtml_(q.html, staffSide ? QNA_LIM.staffChars : QNA_LIM.userChars), now = Date.now();
  if (x.msgs.length >= 60) throw E_('limit', '대화가 너무 길어요. 새 문의로 남겨 주세요.');
  x.msgs.push({ by: u.uid, role: staffSide ? 'staff' : 'user', at: now, html: body });
  if (JSON.stringify(x.msgs).length > 45000) throw E_('limit', '대화가 너무 길어요. 이 문의는 종료하고 새 문의로 남겨 주세요.');
  x.status = staffSide ? 'answered' : 'open'; x.lastBy = staffSide ? 'staff' : 'user'; x.updated = now;
  if (staffSide) x.seenStaff = x.msgs.length; else x.seenUser = x.msgs.length;
  setRow_('qna', x.row, qnaRow_(x));
  return { ok: true, qna: qnaView_(x, u, true), badge: qnaBadge_(u) };
}
function aQnaClose(q, ctx) {
  needQna_(ctx.u);
  var x = findQna_(q.id), u = ctx.u;
  if (!x || !canSeeQna_(u, x)) throw E_('noqna', '찾는 문의가 없어요.');
  if (x.uid !== u.uid && !canAnswer_(u, x)) throw E_('perm', '이 문의는 관리자만 처리할 수 있어요.');
  x.status = 'closed'; x.updated = Date.now();
  setRow_('qna', x.row, qnaRow_(x));
  return { ok: true, qna: qnaView_(x, u, true), badge: qnaBadge_(u) };
}
function qnaMaintenance_() {
  var now = Date.now(), D = 86400000;
  qnas_().forEach(function (x) { if (x.status === 'answered' && now - x.updated > QNA_LIM.autoCloseDays * D) { x.status = 'closed'; setRow_('qna', x.row, qnaRow_(x)); } });
  rewrite_('qna', function (r) { return !(str_(r[5]) === 'closed' && now - num_(r[7]) > QNA_LIM.keepDays * D); });
}

/* ───────────── 공지사항 ─────────────
 * br: '' = 모든 매장, 매장 코드 = 그 매장만. 관리자는 어디든, 운영자는 소속 매장만. 게시 기간·상단 고정·팝업(앱을 열 때 한 번). */

function noticeOf_(r, i) {
  var b = []; try { b = JSON.parse(str_(r[12]) || '[]'); } catch (e) { b = []; }
  return { id: str_(r[0]), br: str_(r[1]), title: str_(r[2]), html: str_(r[3]), pin: num_(r[4]) ? 1 : 0, start: str_(r[5]), end: str_(r[6]), popup: num_(r[7]) ? 1 : 0, by: str_(r[8]), created: num_(r[9]), upd: num_(r[10]), img: str_(r[11]), btns: Array.isArray(b) ? b : [], row: i + 2 };
}
function noticeRow_(n) { return [n.id, n.br, n.title, n.html, n.pin, n.start, n.end, n.popup, n.by, n.created, n.upd, n.img || '', JSON.stringify(n.btns || [])]; }
/** 공지 단추: 앱 안 화면(가입·친구 초대·결제·문의·공지·코스) 또는 https 주소. 2개까지 */
var NOTICE_TO = { join: '가입 화면', invite: '친구에게 알리기', pay: '이용권 결제', qna: '문의하기', notices: '공지 목록', courses: '코스 목록' };
function cleanBtns_(a) {
  if (!Array.isArray(a)) return [];
  var out = [];
  for (var i = 0; i < a.length && out.length < 2; i++) {
    var x = a[i] || {}, label = cleanTitle_(x.label, 16), to = String(x.to || '').replace(/^\s+|\s+$/g, '');
    if (!label || !to) continue;
    if (!NOTICE_TO[to] && !/^https:\/\/[^\s<>"'`\\]{4,300}$/.test(to)) throw E_('bad', '단추 "' + label + '"의 주소는 https:// 로 시작해야 해요.');
    out.push({ label: label, to: to });
  }
  return out;
}
function cleanImg_(v) { v = String(v || ''); return /^i[a-z0-9]{6,24}$/.test(v) || /^assets\/[a-z0-9-]+\.(png|jpg|webp)$/.test(v) ? v : ''; }
function notices_() { return rows_('notices').map(noticeOf_); }
function liveNotice_(n, br) { var t = today_(); return (!n.br || n.br === br) && (!n.start || n.start <= t) && (!n.end || n.end >= t); }
function sortNotices_(l) { l.sort(function (a, b) { return (b.pin - a.pin) || (b.upd - a.upd); }); return l; }
/** 앱을 열 때 받는 짧은 목록(안 읽은 공지 숫자·팝업을 화면이 정함) */
function noticeHeads_(br) { return sortNotices_(notices_().filter(function (n) { return liveNotice_(n, br); })).slice(0, 20).map(function (n) { return { id: n.id, upd: n.upd, popup: n.popup, title: n.title }; }); }
function noticeView_(n, map) { return { id: n.id, br: n.br, store: n.br ? branchName_(n.br) : '모든 매장', title: n.title, html: n.html, pin: n.pin, start: n.start, end: n.end, popup: n.popup, by: nickOf_(n.by, map), created: n.created, upd: n.upd, img: n.img, btns: n.btns }; }
function canEditNotice_(u, br) { return u.kind === 'admin' || (u.kind === 'op' && br === u.home); }
function aNoticeList(q, ctx) {
  var u = ctx.u, map = nickMap_(), all = notices_(), manage = !!q.manage && isStaff_(u);
  var l = manage ? all.filter(function (n) { return u.kind === 'admin' || !n.br || n.br === u.home; }) : all.filter(function (n) { return liveNotice_(n, ctx.br); });
  return { ok: true, list: sortNotices_(l).map(function (n) { var v = noticeView_(n, map); v.canEdit = canEditNotice_(u, n.br); return v; }), canWrite: isStaff_(u), branches: branchList_(true) };
}
function aNoticeSave(q, ctx) {
  var u = ctx.u, br = String(q.br || ''), now = Date.now();
  if (br && !findBranch_(br)) throw E_('branch', '없는 매장이에요.');
  if (!canEditNotice_(u, br)) throw E_('perm', u.kind === 'op' ? '운영자는 소속 매장 공지만 쓸 수 있어요.' : '공지를 쓸 수 없어요.');
  var title = cleanTitle_(q.title, 40); if (!title) throw E_('bad', '제목을 적어 주세요.');
  var html = cleanHtml_(q.html, 2000);
  var d = function (s) { s = String(s || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  var start = d(q.start), end = d(q.end); if (start && end && end < start) throw E_('bad', '끝나는 날이 시작하는 날보다 빨라요.');
  if (q.id) {
    var n = notices_().filter(function (x) { return x.id === String(q.id); })[0];
    if (!n) throw E_('bad', '찾는 공지가 없어요.');
    if (!canEditNotice_(u, n.br)) throw E_('perm', '이 공지는 고칠 수 없어요.');
    if (n.img && n.img !== cleanImg_(q.img)) dropImg_(n.img);
    n.br = br; n.title = title; n.html = html; n.pin = q.pin ? 1 : 0; n.start = start; n.end = end; n.popup = q.popup ? 1 : 0; n.upd = now; n.img = cleanImg_(q.img); n.btns = cleanBtns_(q.btns);
    setRow_('notices', n.row, noticeRow_(n));
  } else append_('notices', noticeRow_({ id: 'n' + now.toString(36) + rand_(3), br: br, title: title, html: html, pin: q.pin ? 1 : 0, start: start, end: end, popup: q.popup ? 1 : 0, by: u.uid, created: now, upd: now, img: cleanImg_(q.img), btns: cleanBtns_(q.btns) }));
  log_(u.nick, '공지', title + ' (' + (br ? branchName_(br) : '모든 매장') + ')');
  return aNoticeList({ manage: 1 }, ctx);
}
function aNoticeDel(q, ctx) {
  var n = notices_().filter(function (x) { return x.id === String(q.id); })[0];
  if (!n) throw E_('bad', '찾는 공지가 없어요.');
  if (!canEditNotice_(ctx.u, n.br)) throw E_('perm', '이 공지는 지울 수 없어요.');
  rewrite_('notices', function (r) { return str_(r[0]) !== n.id; });
  if (n.img) dropImg_(n.img);
  return aNoticeList({ manage: 1 }, ctx);
}

/* ───────────── 그림 (공지에 넣는 사진) ─────────────
 * 시트 칸 하나에 다 안 들어가서 나눠 저장합니다. 한 장 약 45만 자(사진 약 330KB)까지 */
function aImgPut(q, ctx) {
  var data = String(q.data || '');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) throw E_('bad', '그림 파일(png, jpg, webp)만 올릴 수 있어요.');
  if (data.length > LIM.logoMax) throw E_('big', '그림이 너무 커요. 더 작은 그림을 골라 주세요.');
  var id = 'i' + Date.now().toString(36) + rand_(4).toLowerCase().replace(/[^a-z0-9]/g, 'x'), now = Date.now();
  for (var i = 0, n = 0; i < data.length; i += LIM.cell, n++) append_('images', [id, n, data.slice(i, i + LIM.cell), now]);
  log_(ctx.u.nick, '그림 올림', id + ' ' + Math.round(data.length / 1024) + 'KB');
  return { ok: true, id: id };
}
function aImgGet(q) {
  var id = String(q.id || ''); if (!/^i[a-z0-9]{6,24}$/.test(id)) throw E_('bad', '그림을 찾을 수 없어요.');
  var c = cache_(), meta = c.get('img:' + id);                                // 한 번 읽은 그림은 6시간 동안 캐시에서(칸별로 나눠 저장)
  if (meta) { var keys = []; for (var k = 0; k < +meta; k++) keys.push('img:' + id + ':' + k); var got = c.getAll(keys), all = '';
    for (var j = 0; j < keys.length; j++) { if (!got[keys[j]]) { all = null; break; } all += got[keys[j]]; } if (all) return { ok: true, id: id, data: all }; }
  var parts = rows_('images').filter(function (r) { return str_(r[0]) === id; }).sort(function (a, b) { return num_(a[1]) - num_(b[1]); });
  if (!parts.length) throw E_('noimg', '그림이 지워졌어요.');
  var data = parts.map(function (r) { return str_(r[2]); }).join(''), put = {};
  try { parts.forEach(function (r, i) { put['img:' + id + ':' + i] = str_(r[2]); }); c.putAll(put, 21600); c.put('img:' + id, String(parts.length), 21600); } catch (e) { /* 캐시 못 해도 괜찮음 */ }
  return { ok: true, id: id, data: data };
}
/** 공지에 쓰이지 않는 그림(올렸다가 공지를 안 올린 것)을 하루 지나면 지움 */
function dropOrphanImgs_() {
  var used = {}; notices_().forEach(function (n) { if (n.img) used[n.img] = 1; });
  var cut = Date.now() - 86400000;
  rewrite_('images', function (r) { return used[str_(r[0])] || num_(r[3]) > cut; });
}
function dropImg_(id) { if (/^i[a-z0-9]{6,24}$/.test(String(id || ''))) { rewrite_('images', function (r) { return str_(r[0]) !== id; }); cache_().remove('img:' + id); } }
/** 처음 한 번: 친구 초대 홍보 공지(그림 + 친구에게 알리기 + 가입 화면 보기) */
function seedPromo_() {
  if (settings_().promo_seeded) return '';
  var now = Date.now(), jc = joinCfg_();
  append_('notices', noticeRow_({ id: 'npromo1', br: '', title: '🎁 친구에게 알리고 ' + jc.refDays + '일 더 받으세요', pin: 1, start: '', end: '', popup: 1, by: '', created: now, upd: now,
    html: '<b>파크골프 공략노트</b>를 친구에게 알려 주세요.<br>내 초대 링크로 친구가 가입하면 <b>5일 무료 체험</b>을 바로 시작하고,<br>그 친구가 월간·연간 이용권을 결제하면 나에게 <span class="big c-r">' + jc.refDays + '일</span>을 더 드려요.<br><br>아래 <b>친구에게 알리기</b>를 누르면 카카오톡으로 바로 보낼 수 있어요.',
    img: 'assets/promo-invite.jpg', btns: [{ label: '친구에게 알리기', to: 'invite' }, { label: '가입 화면 보기', to: 'join' }] }));
  setSetting_('promo_seeded', 1);
  return '친구 초대 홍보 공지를 올렸어요(맨 위 고정).\n';
}

/* ───────────── 결제 (닉네임 송금 + 관리자 승인, 이용권은 전 매장 공통) ───────────── */

function payOf_(r, i) {
  return { id: str_(r[0]), uid: str_(r[1]), plan: str_(r[2]), amount: num_(r[3]), method: str_(r[4]), depositor: str_(r[5]), status: str_(r[6]),
    created: num_(r[7]), decided: num_(r[8]), by: str_(r[9]), start: str_(r[10]), end: str_(r[11]), refund: num_(r[12]), refundAt: num_(r[13]), name: str_(r[14]), row: i + 2 };
}
function payRow_(p) { return [p.id, p.uid, p.plan, p.amount, p.method, p.depositor, p.status, p.created, p.decided, p.by, p.start, p.end, p.refund, p.refundAt, p.name || '']; }
function payView_(p, map) { var o = {}; for (var k in p) if (k !== 'row') o[k] = p[k]; o.nick = nickOf_(p.uid, map); o.planName = PLAN[p.plan] ? PLAN[p.plan].name : p.plan; return o; }
function pays_() { return rows_('payments').map(payOf_); }
function findPay_(id) { var a = pays_(); for (var i = 0; i < a.length; i++) if (a[i].id === String(id)) return a[i]; return null; }
function priceOf_(plan) { var c = cfg_(); return num_(plan === 'year' ? c.price_year : c.price_month); }
function periodFor_(u, plan) { var t = today_(), start = t; if ((u.kind === 'month' || u.kind === 'year') && u.end && u.end >= t) start = addDays_(u.end, 1); return { start: start, end: addDays_(start, PLAN[plan].days - 1) }; }
function aPayInfo(q, ctx) {
  var c = cfg_(), p = myPending_(ctx.u.uid);
  return { ok: true, user: userInfo_(ctx.u), pay: canPay_(ctx.u), pending: p ? payView_(p) : null,
    prices: { month: priceOf_('month'), year: priceOf_('year') }, days: { month: PLAN.month.days, year: PLAN.year.days },
    qr: { month: c.qr_month || '', year: c.qr_year || '' }, bank: { name: c.bank_name || '', no: c.bank_no || '', holder: c.bank_holder || '' },
    preview: { month: periodFor_(ctx.u, 'month'), year: periodFor_(ctx.u, 'year') } };
}
function aPayReq(q, ctx) {
  var u = ctx.u, plan = q.plan === 'year' ? 'year' : q.plan === 'month' ? 'month' : '';
  if (!plan) throw E_('bad', '이용권을 골라 주세요.');
  var can = canPay_(u); if (!can.ok) throw E_('nopay', can.why);
  if (refunds_().some(function (x) { return x.uid === u.uid && x.status === 'req'; })) throw E_('nopay', '환불 신청 중에는 결제할 수 없어요. 환불 신청을 취소하거나 처리된 뒤에 결제해 주세요.');
  var method = q.method === 'bank' ? 'bank' : 'kakao';
  var dep = cleanTitle_(q.depositor || u.nick, 10) || u.nick;
  var old = myPending_(u.uid); if (old) { old.status = 'cancel'; setRow_('payments', old.row, payRow_(old)); }
  var p = { id: 'p' + Date.now().toString(36) + rand_(4), uid: u.uid, plan: plan, amount: priceOf_(plan), method: method, depositor: dep, status: 'pending', created: Date.now(), decided: 0, by: '', start: '', end: '', refund: 0, refundAt: 0, name: u.nick };
  append_('payments', payRow_(p));
  log_(u.nick, '결제 신청', plan + ' ' + p.amount + '원 (' + method + ', ' + dep + ')');
  return { ok: true, pending: payView_(p) };
}
function aPayCancel(q, ctx) { var p = myPending_(ctx.u.uid); if (!p) throw E_('nopay', '확인 기다리는 결제가 없어요.'); p.status = 'cancel'; setRow_('payments', p.row, payRow_(p)); return { ok: true }; }
/** 결제 목록에 추천인: 아직 보상 전이면 "승인하면 ○○님에게 +N일" 안내용 */
function payRef_(v, um, map, jc) {
  var u = um[v.uid]; if (!u || !u.ref) return v;
  var r = um[u.ref]; v.refNick = nickOf_(u.ref, map);
  var done = u.refPay ? u.refPay.split('|') : null;
  v.refDone = done ? 1 : 0;
  v.refThis = done && done[0] === v.id ? num_(done[1]) : 0;                  // 이 결제로 받은 보상 일수
  v.refWill = !done && jc.refOn && r && r.active && !isStaff_(r) ? jc.refDays : 0;
  return v;
}
function aPayList() {
  var all = pays_(), pend = [], done = [], map = nickMap_(), um = {}, jc = joinCfg_();
  users_().forEach(function (u) { um[u.uid] = u; });
  var view = function (p) { return payRef_(payView_(p, map), um, map, jc); };
  for (var i = all.length - 1; i >= 0; i--) { if (all[i].status === 'pending') pend.push(view(all[i])); else if (done.length < 40 && all[i].status !== 'cancel') done.push(view(all[i])); }
  pend.reverse();
  return { ok: true, pending: pend, recent: done };
}
function aPayDecide(q, ctx) {
  var p = findPay_(q.id);
  if (!p || p.status !== 'pending' || cache_().get('pd:' + p.id)) throw E_('nopay', '이미 처리된 결제예요. (두 번 누르셨을 수 있어요) 목록을 새로 불러올게요.');
  cache_().put('pd:' + p.id, '1', 21600);
  try { return payDecide_(p, q, ctx); } catch (e) { cache_().remove('pd:' + p.id); throw e; }   // 처리 중 오류면 다시 누를 수 있게
}
function payDecide_(p, q, ctx) {
  var u = userByUid_(p.uid);
  if (!q.ok || !u) { p.status = 'rejected'; p.decided = Date.now(); p.by = ctx.u.uid; setRow_('payments', p.row, payRow_(p)); log_(ctx.u.nick, '결제 거절', (u ? u.nick : p.name) + ' ' + p.amount + '원'); return { ok: true, pay: payView_(p) }; }
  var per = periodFor_(u, p.plan), append = (u.kind === 'month' || u.kind === 'year') && u.end && u.end >= today_();
  if (!append) u.start = per.start;
  u.end = per.end; u.kind = p.plan; saveUser_(u);
  p.status = 'ok'; p.decided = Date.now(); p.by = ctx.u.uid; p.start = per.start; p.end = per.end; setRow_('payments', p.row, payRow_(p));
  log_(ctx.u.nick, '결제 승인', u.nick + ' ' + PLAN[p.plan].name + ' ' + per.start + '~' + per.end);
  var rw = reward_(u, p);
  return { ok: true, pay: payView_(p), member: memberView_(u), reward: rw };
}
function refundCalc_(p, at) {                                              // at: 환불 신청한 때(없으면 지금) 기준으로 계산
  at = at || Date.now();
  var t = Utilities.formatDate(new Date(at), TZ, 'yyyy-MM-dd'), total = PLAN[p.plan].days, used = t < p.start ? 0 : Math.min(total, diffDays_(p.start, t)), remain = total - used;
  var recUsed = rows_('records').some(function (r) { return str_(r[1]) === p.uid && num_(r[4]) >= p.decided && num_(r[4]) <= at; });
  if (at - p.decided < LIM.refundFullDays * 86400000 && !recUsed) return { amount: p.amount, remain: remain, total: total, full: true, why: '결제 후 ' + LIM.refundFullDays + '일 이내이고 기록을 쓰지 않아 전액 환불해요.' };
  var amt = Math.floor(p.amount * remain / total / 100) * 100;
  return { amount: amt, remain: remain, total: total, full: false, why: p.amount.toLocaleString() + '원 × 남은 ' + remain + '일 ÷ ' + total + '일 (100원 미만 버림)' };
}
function aPayRefund(q, ctx) {
  var p = findPay_(q.id);
  if (!p || p.status !== 'ok' || (q.confirm && cache_().get('rf:' + p.id))) throw E_('nopay', '환불할 수 있는 결제가 아니에요. (이미 처리됐을 수 있어요)');
  var later = pays_().filter(function (x) { return x.status === 'ok' && x.uid === p.uid && x.decided > p.decided; });
  if (later.length) throw E_('nopay', '이 회원의 가장 최근 결제부터 환불할 수 있어요.');
  var calc = refundCalc_(p);
  if (!q.confirm) return { ok: true, calc: calc };
  cache_().put('rf:' + p.id, '1', 21600);
  var u = userByUid_(p.uid), t = today_();
  if (u) { u.end = t < p.start ? addDays_(p.start, -1) : addDays_(t, -1); saveUser_(u); unreward_(u, p); }
  p.status = 'refunded'; p.refund = calc.amount; p.refundAt = Date.now(); setRow_('payments', p.row, payRow_(p));
  refunds_().forEach(function (x) { if (x.pid === p.id && x.status === 'req') { x.status = 'done'; x.amount = calc.amount; x.decided = Date.now(); x.by = ctx.u.uid; wipeAcct_(x); setRow_('refunds', x.row, refundRow_(x)); } });
  log_(ctx.u.nick, '환불', (u ? u.nick : p.name) + ' ' + calc.amount + '원');
  return { ok: true, calc: calc, pay: payView_(p), member: u ? memberView_(u) : null };
}

/* ───────────── 환불 신청 (회원이 받을 계좌를 적고 → 관리자가 송금 후 완료) ─────────────
 * 계좌번호·예금주는 회원 본인에게도 일부를 *로 가려서 보여요. 전체 번호는 처리 전 관리자 화면에만.
 * 완료·반려·취소되면 시트에서도 전체 번호를 지우고 가린 번호만 남겨요. */
function maskAcct_(a) {
  a = String(a || ''); var digits = a.replace(/\D/g, '').length, k = 0;
  return a.replace(/\d/g, function (d) { k++; return k <= 3 || k > digits - 3 ? d : '*'; });
}
function maskName_(n) { n = String(n || ''); return n.length <= 1 ? n : n.length === 2 ? n[0] + '*' : n[0] + new Array(n.length - 1).join('*') + n[n.length - 1]; }
function refundOf_(r, i) { return { id: str_(r[0]), uid: str_(r[1]), pid: str_(r[2]), created: num_(r[3]), status: str_(r[4]), bank: str_(r[5]), acct: str_(r[6]), holder: str_(r[7]), reason: str_(r[8]), amount: num_(r[9]), remain: num_(r[10]), why: str_(r[11]), decided: num_(r[12]), by: str_(r[13]), note: str_(r[14]), name: str_(r[15]), row: i + 2 }; }
function refundRow_(x) { return [x.id, x.uid, x.pid, x.created, x.status, x.bank, x.acct, x.holder, x.reason, x.amount, x.remain, x.why, x.decided, x.by, x.note, x.name]; }
function refunds_() { return rows_('refunds').map(refundOf_); }
function wipeAcct_(x) { if (x.acct.indexOf('*') < 0) x.acct = maskAcct_(x.acct); if (x.holder.indexOf('*') < 0) x.holder = maskName_(x.holder); }
function refundView_(x, full, map) {
  var p = findPay_(x.pid);
  return { id: x.id, uid: x.uid, nick: nickOf_(x.uid, map), pid: x.pid, planName: p && PLAN[p.plan] ? PLAN[p.plan].name : '', paid: p ? p.amount : 0, period: p ? p.start + '~' + p.end : '',
    created: x.created, status: x.status, bank: x.bank, acct: full && x.status === 'req' ? x.acct : maskAcct_(x.acct), holder: full && x.status === 'req' ? x.holder : maskName_(x.holder),
    reason: x.reason, amount: x.amount, remain: x.remain, why: x.why, decided: x.decided, note: x.note };
}
/** 환불할 수 있는 결제: 가장 최근 승인 결제이고 아직 환불 전 */
function refundable_(uid) {
  var mine = pays_().filter(function (p) { return p.uid === uid && (p.status === 'ok' || p.status === 'refunded'); }).sort(function (a, b) { return b.decided - a.decided; });
  return mine.length && mine[0].status === 'ok' ? mine[0] : null;
}
function refundState_(u) {
  if (isStaff_(u)) return null;
  var mine = refunds_().filter(function (x) { return x.uid === u.uid; }).sort(function (a, b) { return (b.created - a.created) || (b.row - a.row); }), last = mine[0];
  var req = last && last.status === 'req' ? refundView_(last, false) : null;
  var recent = last && last.status !== 'req' && last.status !== 'cancel' && Date.now() - last.decided < 14 * 86400000 ? refundView_(last, false) : null;
  return { can: !req && !!refundable_(u.uid) ? 1 : 0, req: req, recent: recent };
}
function aRefundInfo(q, ctx) {
  var u = ctx.u, p = refundable_(u.uid), st = refundState_(u) || {};
  return { ok: true, state: st, pay: p ? payView_(p) : null, calc: p && !st.req ? refundCalc_(p) : null, fullDays: LIM.refundFullDays };
}
function aRefundReq(q, ctx) {
  var u = ctx.u;
  if (isStaff_(u)) throw E_('perm', '운영진은 환불 신청을 하지 않아요.');
  if (refunds_().some(function (x) { return x.uid === u.uid && x.status === 'req'; })) throw E_('dup', '이미 환불 신청을 했어요. 관리자가 확인하고 있어요.');
  var p = refundable_(u.uid); if (!p) throw E_('nopay', '환불할 수 있는 결제가 없어요.');
  var bank = cleanTitle_(q.bank, 20), acct = String(q.acct || '').replace(/[^\d-]/g, '').replace(/^-+|-+$/g, ''), holder = cleanTitle_(q.holder, 20), reason = cleanTitle_(q.reason, 100);
  var nd = acct.replace(/\D/g, '').length;
  if (!bank) throw E_('bad', '은행을 골라 주세요.');
  if (nd < 6 || nd > 20) throw E_('bad', '계좌번호를 숫자로 정확히 적어 주세요. (- 는 있어도 없어도 돼요)');
  if (!holder) throw E_('bad', '예금주 이름을 적어 주세요.');
  if (!q.agree) throw E_('bad', '안내를 확인하고 체크해 주세요.');
  var now = Date.now(), calc = refundCalc_(p, now);
  var x = { id: 'r' + now.toString(36) + rand_(3), uid: u.uid, pid: p.id, created: now, status: 'req', bank: bank, acct: acct, holder: holder, reason: reason, amount: calc.amount, remain: calc.remain, why: calc.why, decided: 0, by: '', note: '', name: u.nick };
  append_('refunds', refundRow_(x));
  log_(u.nick, '환불 신청', (PLAN[p.plan] ? PLAN[p.plan].name : p.plan) + ' 예상 ' + calc.amount + '원 · ' + bank + ' ' + maskAcct_(acct));
  return { ok: true, state: refundState_(u) };
}
function aRefundCancel(q, ctx) {
  var x = refunds_().filter(function (r) { return r.uid === ctx.u.uid && r.status === 'req'; })[0];
  if (!x) throw E_('nopay', '취소할 환불 신청이 없어요.');
  x.status = 'cancel'; x.decided = Date.now(); x.by = ctx.u.uid; wipeAcct_(x); setRow_('refunds', x.row, refundRow_(x));
  log_(ctx.u.nick, '환불 신청 취소', '');
  return { ok: true, state: refundState_(ctx.u) };
}
function aRefundList() {
  var map = nickMap_(), all = refunds_().sort(function (a, b) { return (b.created - a.created) || (b.row - a.row); });
  return { ok: true, pending: all.filter(function (x) { return x.status === 'req'; }).reverse().map(function (x) { return refundView_(x, true, map); }),
    recent: all.filter(function (x) { return x.status === 'done' || x.status === 'rejected'; }).slice(0, 20).map(function (x) { return refundView_(x, false, map); }) };
}
function aRefundDecide(q, ctx) {
  var x = refunds_().filter(function (r) { return r.id === String(q.id); })[0];
  if (!x || x.status !== 'req' || cache_().get('rd:' + x.id)) throw E_('nopay', '이미 처리된 환불 신청이에요. 목록을 새로 불러올게요.');
  cache_().put('rd:' + x.id, '1', 21600);
  try {
    var u = userByUid_(x.uid);
    if (!q.ok) {
      x.status = 'rejected'; x.note = cleanTitle_(q.note, 100) || '관리자 확인 결과 환불할 수 없어요.'; x.decided = Date.now(); x.by = ctx.u.uid; wipeAcct_(x); setRow_('refunds', x.row, refundRow_(x));
      log_(ctx.u.nick, '환불 반려', (u ? u.nick : x.name) + ' · ' + x.note);
      return { ok: true };
    }
    var p = findPay_(x.pid);
    if (!p || p.status !== 'ok') throw E_('nopay', '이 결제는 이미 환불됐거나 찾을 수 없어요.');
    var last = refundable_(x.uid); if (!last || last.id !== p.id) throw E_('nopay', '이 회원은 신청 뒤에 결제한 이용권이 있어요. 회원과 확인한 뒤 반려하고 다시 신청받아 주세요.');
    var calc = { amount: x.amount, remain: x.remain, why: x.why }, t = Utilities.formatDate(new Date(x.created), TZ, 'yyyy-MM-dd');   // 금액은 신청할 때 정한 그대로
    if (u) { u.end = t < p.start ? addDays_(p.start, -1) : addDays_(t, -1); saveUser_(u); unreward_(u, p); }      // 신청한 날부터 이용 끝
    p.status = 'refunded'; p.refund = calc.amount; p.refundAt = Date.now(); setRow_('payments', p.row, payRow_(p));
    x.status = 'done'; x.amount = calc.amount; x.decided = Date.now(); x.by = ctx.u.uid; wipeAcct_(x); setRow_('refunds', x.row, refundRow_(x));
    log_(ctx.u.nick, '환불 완료', (u ? u.nick : x.name) + ' ' + calc.amount + '원 · ' + x.bank + ' ' + x.acct);
    return { ok: true, amount: calc.amount };
  } catch (e) { cache_().remove('rd:' + x.id); throw e; }
}

/* ───────────── 회원 관리 (운영자는 소속 매장이 기본 매장인 회원만) ───────────── */

function memberView_(u, extra) {
  var i = userInfo_(u), o = { uid: u.uid, nick: u.nick, prev: i.prev, kind: u.kind, kindName: i.kindName, st: i.st, start: u.start, end: u.end, left: i.left, active: u.active ? 1 : 0, last: u.last, seen: u.seen, must: u.must ? 1 : 0, ext: u.ext || 0, home: u.home, homeName: branchName_(u.home), created: u.created,
    src: u.src, isNew: Date.now() - u.created < 7 * 86400000 ? 1 : 0, ref: u.ref ? 1 : 0 };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
function inScope_(me, u) { return me.kind === 'admin' || (me.kind === 'op' && !isStaff_(u) && u.home === me.home); }
function aMembers(q, ctx) {
  var me = ctx.u, now = Date.now(), users = users_().filter(function (u) { return inScope_(me, u) || u.uid === me.uid; });
  if (me.kind === 'admin' && q.br) users = users.filter(function (u) { return u.home === q.br || (q.br === '_staff' && isStaff_(u)); });
  var keys = users.map(function (u) { return 'seen:' + u.uid; }), seen = cache_().getAll ? cache_().getAll(keys) : {};
  var seats = cget_('seats') || {}, cnt = {}, rr = rows_('records'), pend = {}, tm = trustMap_(), devN = {}, map = nickMap_(), paid = {};
  pays_().forEach(function (p) { if (p.status === 'ok' || p.status === 'refunded') paid[p.uid] = 1; });
  users_().forEach(function (u) { if (u.dev) devN[u.dev] = (devN[u.dev] || 0) + 1; });
  for (var i = 0; i < rr.length; i++) if (num_(rr[i][2]) > 0) { var k = str_(rr[i][1]); cnt[k] = (cnt[k] || 0) + 1; }
  pays_().forEach(function (p) { if (p.status === 'pending') pend[p.uid] = 1; });
  var list = users.map(function (u) {
    var s = Math.max(num_(seen['seen:' + u.uid]), u.seen || 0, seats[u.uid] || 0);
    var stale = u.src === 'self' && u.kind === 'trial' && statusOf_(u) === 'expired' && u.end && diffDays_(u.end, today_()) > 30 && now - s > 30 * 86400000 ? 1 : 0;
    return memberView_(u, { seenAt: s, online: now - s < LIM.idleMs ? 1 : 0, courses: cnt[u.uid] || 0, pendingPay: pend[u.uid] || 0, trust: tm[u.uid] || 0, sameDev: u.dev ? devN[u.dev] - 1 : 0, stale: stale,
      refNick: u.ref ? nickOf_(u.ref, map) : '', refPaid: u.refPay ? 1 : 0, canRef: !isStaff_(u) && !paid[u.uid] ? 1 : 0 });
  });
  var order = { admin: 0, op: 1, year: 2, month: 3, trial: 4 };
  list.sort(function (a, b) { return (b.online - a.online) || ((order[a.kind] || 9) - (order[b.kind] || 9)) || (a.nick < b.nick ? -1 : 1); });
  return { ok: true, members: list, seats: seatStat_(), me: me.kind, home: me.home, branches: branchList_(me.kind === 'admin') };
}
function aMCreate(q, ctx) {
  var me = ctx.u, nick = normNick_(q.nick), kind = q.kind, isAdmin = me.kind === 'admin';
  if (!okNick_(nick)) throw E_('nick', '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)');
  if (['trial', 'month', 'year', 'op'].indexOf(kind) < 0) throw E_('bad', '회원 종류를 골라 주세요.');
  if (!isAdmin && kind !== 'trial') throw E_('perm', '운영자는 체험회원만 만들 수 있어요.');
  var why = nickTaken_(nick, ''); if (why) throw E_('dupnick', why);
  var home = isAdmin ? (findBranch_(q.home) ? findBranch_(q.home).code : ctx.br) : me.home;
  var t = today_(), len = kind === 'op' ? 6 : 4, pin = genPin_(len), salt = rand_(16);
  var u = { nick: nick, kind: kind, start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0, ext: 0, seen: 0, uid: newUid_(), home: home, homeAt: 0, nickAt: 0, prev: '', prevUntil: 0, lastBr: home, lockN: 0, plen: len };
  u.hash = hashPin_(pin, salt);
  if (kind === 'trial') { u.start = t; u.end = addDays_(t, LIM.trialDays - 1); }
  if (kind === 'month' || kind === 'year') { u.start = t; u.end = addDays_(t, PLAN[kind].days - 1); }
  append_('users', userRow_(u));
  log_(me.nick, '계정 만들기', nick + ' (' + KIND_NAME[kind] + ', ' + branchName_(home) + ')');
  return { ok: true, pin: pin, member: memberView_(u, { courses: 0, online: 0 }) };
}
function aMUpdate(q, ctx) {
  var me = ctx.u, isAdmin = me.kind === 'admin', u = (q.uid && userByUid_(q.uid)) || findUser_(q.nick);
  if (!u) throw E_('nouser', '찾는 회원이 없어요.');
  if (u.kind === 'admin') throw E_('perm', '관리자 계정은 바꿀 수 없어요.');
  if (u.uid === me.uid) throw E_('self', '내 계정은 여기서 바꿀 수 없어요.');
  var op = q.op, out = { ok: true }, t = today_();
  if (!isAdmin && !(op === 'trialExt' || op === 'pin' || (op === 'active' && u.kind === 'trial'))) throw E_('perm', '이 기능은 관리자만 할 수 있어요.');
  if (!inScope_(me, u)) throw E_('perm', isStaff_(u) ? '운영자 계정은 관리자만 관리할 수 있어요.' : '다른 매장 회원은 그 매장 운영자가 관리해요.');
  if (op === 'trialExt') {
    if (u.kind !== 'trial') throw E_('bad', '체험회원만 연장할 수 있어요.');
    if ((u.ext || 0) >= LIM.trialExtMax) throw E_('bad', '체험 연장은 ' + LIM.trialExtMax + '번까지만 할 수 있어요.');
    var base = u.end && u.end >= t ? u.end : addDays_(t, -1);
    u.end = addDays_(base, 1); u.ext = (u.ext || 0) + 1;
  } else if (op === 'kind') {
    if (['month', 'year', 'op'].indexOf(q.kind) < 0) throw E_('bad', '바꿀 회원 종류를 골라 주세요. (체험으로는 바꿀 수 없어요)');
    if (q.kind === 'op') { u.kind = 'op'; u.start = ''; u.end = ''; u.must = 1; }                  // 다음 로그인 때 6자리로 바꾸게
    else { u.kind = q.kind; u.start = t; u.end = addDays_(t, PLAN[q.kind].days - 1); }
  } else if (op === 'extend') {
    if (u.kind !== 'month' && u.kind !== 'year') throw E_('bad', '월간·연간회원만 기간을 늘릴 수 있어요.');
    var b2 = u.end && u.end >= t ? u.end : addDays_(t, -1);
    u.end = addDays_(b2, Math.max(1, Math.min(730, Math.round(Number(q.days) || 30))));
  } else if (op === 'home') {
    var nb = findBranch_(q.br); if (!nb) throw E_('branch', '없는 매장이에요.');
    u.home = nb.code; u.homeAt = Date.now();
  } else if (op === 'rename') {                                         // 관리자: 닉네임 확인 요청 처리(선점한 닉네임 정리). 예전 이름은 보호하지 않고 바로 풀어 줌
    var to = normNick_(q.to);
    if (!okNick_(to)) throw E_('nick', '닉네임은 한글·영문·숫자 2~8자로 적어 주세요.');
    var w2 = nickTaken_(to, u.uid); if (w2) throw E_('dupnick', w2);
    var was = u.nick; u.nick = to; u.prev = ''; u.prevUntil = 0;
    log_(me.nick, '닉네임 정리', was + ' → ' + to);
  } else if (op === 'ref') {                                            // 관리자: 추천인 정하기(링크 없이 가입한 분). 첫 결제 전까지만
    if (isStaff_(u)) throw E_('bad', '운영진에게는 추천인을 정하지 않아요.');
    if (pays_().some(function (p) { return p.uid === u.uid && (p.status === 'ok' || p.status === 'refunded'); })) throw E_('bad', '첫 결제를 한 뒤에는 추천인을 바꿀 수 없어요.');
    var to = normNick_(q.to);
    if (!to) { log_(me.nick, '추천인 지움', u.nick + (u.ref ? ' (' + nickOf_(u.ref, nickMap_()) + ')' : '')); u.ref = ''; }
    else {
      var r = findUser_(to);
      if (!r) throw E_('nouser', '"' + to + '" 닉네임의 회원이 없어요.');
      if (r.uid === u.uid) throw E_('bad', '자기 자신을 추천인으로 정할 수 없어요.');
      if (!r.active) throw E_('bad', '이용이 중지된 회원은 추천인이 될 수 없어요.');
      if (r.ref === u.uid) throw E_('bad', '서로 추천인이 될 수는 없어요. (' + r.nick + '님은 이 회원의 초대로 가입했어요)');
      if (u.dev && r.dev && u.dev === r.dev) throw E_('bad', '같은 휴대폰으로 가입한 계정끼리는 추천인이 될 수 없어요.');
      u.ref = r.uid; u.refPay = '';
      log_(me.nick, '추천인 정함', u.nick + ' ← ' + r.nick + (isStaff_(r) ? ' (운영진이라 보상 없음)' : ''));
    }
  } else if (op === 'pin') {
    var len = pinLen_(u), pin = genPin_(len);
    u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0; u.lockN = 0; u.plen = len;
    out.pin = pin; saveUser_(u); dropSessions_(u.uid);
  } else if (op === 'active') {
    u.active = q.on ? 1 : 0; if (!u.active) dropSessions_(u.uid);
  } else if (op === 'delete') {
    var k = u.uid;
    dropSessions_(k);
    rewrite_('records', function (r) { return str_(r[1]) !== k; });
    rewrite_('prefs', function (r) { return str_(r[0]) !== k; });
    rewrite_('uses', function (r) { return str_(r[0]) !== k && str_(r[1]) !== k; });
    rewrite_('qna', function (r) { return str_(r[1]) !== k; });
    rewrite_('refunds', function (r) { return str_(r[1]) !== k; });
    rewrite_('users', function (r) { return str_(r[14]) !== k; });
    log_(me.nick, '계정 삭제', u.nick);
    return out;
  } else throw E_('bad', '알 수 없는 요청이에요.');
  if (op !== 'pin') saveUser_(u);
  log_(me.nick, '회원 변경(' + op + ')', u.nick);
  out.member = memberView_(u);
  return out;
}

/* ───────────── 현황판 (관리자: 전체·매장별 / 운영자: 소속 매장, 결제 금액 제외) ───────────── */

function aDash(q, ctx) {
  var me = ctx.u, isAdmin = me.kind === 'admin', br = isAdmin ? String(q.br || '') : me.home, now = Date.now(), t = today_(), t0 = dayStart_(t), month = t.slice(0, 7);
  var all = users_(), seenC = cache_().getAll ? cache_().getAll(all.map(function (u) { return 'seen:' + u.uid; })) : {};
  var users = all.filter(function (u) { return !isStaff_(u) && (!br || u.home === br); });
  var per = {}, total = { trial: 0, month: 0, year: 0, expired: 0, all: 0 };
  branches_().forEach(function (b) { per[b.code] = { code: b.code, name: b.name, active: b.active, trial: 0, month: 0, year: 0, expired: 0, all: 0, today: 0 }; });
  var today = 0, soon = [], recent = [];
  users.forEach(function (u) {
    var st = statusOf_(u), key = st === 'expired' ? 'expired' : u.kind, row = per[u.home] || (per[u.home] = { code: u.home, name: branchName_(u.home), trial: 0, month: 0, year: 0, expired: 0, all: 0, today: 0 });
    row[key] = (row[key] || 0) + 1; row.all++; total[key] = (total[key] || 0) + 1; total.all++;
    var s = Math.max(num_(seenC['seen:' + u.uid]), u.seen || 0, u.last || 0);
    if (s >= t0) { today++; row.today++; }
    var left = leftDays_(u);
    if (st === 'active' && left !== null && left <= 7) soon.push({ uid: u.uid, nick: u.nick, kindName: KIND_NAME[u.kind], end: u.end, left: left, home: u.home, homeName: branchName_(u.home) });
    if (now - u.created < 7 * 86400000) recent.push({ uid: u.uid, nick: u.nick, kindName: KIND_NAME[u.kind], created: u.created, homeName: branchName_(u.home) });
  });
  soon.sort(function (a, b) { return a.left - b.left; }); recent.sort(function (a, b) { return b.created - a.created; });
  var out = { ok: true, br: br, store: br ? branchName_(br) : '모든 매장', total: total, today: today, branches: Object.keys(per).map(function (k) { return per[k]; }).filter(function (r) { return !br || r.code === br; }),
    soon: soon.slice(0, 20), recent: recent.slice(0, 20), seats: seatStat_(), isAdmin: isAdmin };
  var okPay = {}; pays_().forEach(function (p) { if (p.status === 'ok' || p.status === 'refunded') okPay[p.uid] = 1; });
  out.joinsToday = users.filter(function (u) { return u.src === 'self' && u.created >= t0; }).length;
  var rec30 = users.filter(function (u) { return now - u.created < 30 * 86400000; });
  out.conv = { joined: rec30.length, paid: rec30.filter(function (u) { return okPay[u.uid]; }).length, self: rec30.filter(function (u) { return u.src === 'self'; }).length };
  var qs = qnas_(); out.qnaOpen = qs.filter(function (x) { return x.status === 'open' && canAnswer_(me, x) && (!br || x.br === br); }).length;
  if (isAdmin) {
    var pays = pays_(), homeOf = {}; all.forEach(function (u) { homeOf[u.uid] = u.home; });
    var mine = function (p) { return !br || homeOf[p.uid] === br; };
    var ok = pays.filter(function (p) { return (p.status === 'ok' || p.status === 'refunded') && mine(p) && Utilities.formatDate(new Date(p.decided), TZ, 'yyyy-MM') === month; });
    var refunds = pays.filter(function (p) { return p.status === 'refunded' && mine(p) && Utilities.formatDate(new Date(p.refundAt), TZ, 'yyyy-MM') === month; });
    out.month = { label: month, count: ok.length, amount: ok.reduce(function (s, p) { return s + p.amount; }, 0), refund: refunds.reduce(function (s, p) { return s + p.refund; }, 0) };
    out.month.net = out.month.amount - out.month.refund;
    out.pending = pays.filter(function (p) { return p.status === 'pending' && mine(p); }).length;
    out.refundReq = refunds_().filter(function (x) { return x.status === 'req' && mine({ uid: x.uid }); }).length;
  }
  return out;
}

/* ───────────── 매장 관리 (관리자) ───────────── */

function aBranchList(q, ctx) {
  var cnt = {}; users_().forEach(function (u) { if (!isStaff_(u)) cnt[u.home] = (cnt[u.home] || 0) + 1; });
  return { ok: true, branches: branches_().map(function (b) { return { code: b.code, name: b.name, active: b.active, order: b.order, members: cnt[b.code] || 0 }; }) };
}
function aBranchSave(q, ctx) {
  var code = String(q.code || '').toLowerCase(), name = cleanTitle_(q.name, 20);
  if (!/^[a-z][a-z0-9]{1,15}$/.test(code)) throw E_('bad', '매장 코드는 영문 소문자로 시작하는 2~16자(영문 소문자·숫자)로 적어 주세요. 예: suyu');
  if (!name) throw E_('bad', '매장 이름을 적어 주세요.');
  var all = rows_('branches'), at = -1;
  for (var i = 0; i < all.length; i++) if (str_(all[i][0]) === code) at = i;
  if (at >= 0) {
    var r = all[at], active = q.active === undefined ? num_(r[2]) : (q.active ? 1 : 0);
    if (!active && code === firstBranch_() && branches_().filter(function (b) { return b.active; }).length === 1) throw E_('bad', '열려 있는 매장이 하나뿐이라 닫을 수 없어요.');
    setRow_('branches', at + 2, [code, name, active, q.order !== undefined ? num_(q.order) : num_(r[3]), num_(r[4])]);
    log_(ctx.u.nick, '매장 수정', code + ' ' + name + (active ? '' : ' (닫음)'));
  } else {
    if (q.create !== 1 && q.create !== true) throw E_('bad', '없는 매장이에요.');
    var mx = 0; all.forEach(function (r2) { mx = Math.max(mx, num_(r2[3])); });
    append_('branches', [code, name, 1, mx + 1, Date.now()]);
    log_(ctx.u.nick, '매장 추가', code + ' ' + name);
  }
  cache_().remove('branches');
  return aBranchList(q, ctx);
}

/* ───────────── 관리자 설정 ───────────── */

function aAdminCfg() {
  var c = cfg_();
  return { ok: true, cfg: { price_month: num_(c.price_month), price_year: num_(c.price_year), qr_month: c.qr_month || '', qr_year: c.qr_year || '',
    bank_name: c.bank_name || '', bank_no: c.bank_no || '', bank_holder: c.bank_holder || '', seats: num_(c.seats), qna_mode: qnaMode_(), qna_testers: String(c.qna_testers || ''),
    join_mode: joinCfg_().on ? 'on' : 'off', join_per_day: joinCfg_().perDay, ref_on: joinCfg_().refOn ? 1 : 0, ref_days: joinCfg_().refDays }, seats: seatStat_() };
}
function aSetCfg(q, ctx) {
  var ch = [];
  function txt(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').replace(/^\s+|\s+$/g, '').slice(0, max); }
  ['price_month', 'price_year'].forEach(function (k) {
    if (q[k] === undefined) return;
    var v = Math.round(Number(String(q[k]).replace(/[^\d]/g, '')));
    if (!(v >= 100 && v <= 10000000)) throw E_('bad', '요금은 100원 이상으로 넣어 주세요.');
    setSetting_(k, v); ch.push(k);
  });
  ['qr_month', 'qr_year'].forEach(function (k) {
    if (q[k] === undefined) return;
    var v = txt(q[k], 200);
    if (v && !/^https:\/\/qr\.kakaopay\.com\/[A-Za-z0-9]+$/.test(v)) throw E_('bad', '카카오페이 송금 QR이 아니에요. 카카오페이에서 만든 QR을 올려 주세요.');
    setSetting_(k, v); ch.push(k);
  });
  if (q.bank_name !== undefined) { setSetting_('bank_name', txt(q.bank_name, 20)); ch.push('은행'); }
  if (q.bank_no !== undefined) { var no = txt(q.bank_no, 30); if (no && !/^[\d-]{6,30}$/.test(no)) throw E_('bad', '계좌번호는 숫자와 - 만 넣어 주세요.'); setSetting_('bank_no', no); ch.push('계좌'); }
  if (q.bank_holder !== undefined) { setSetting_('bank_holder', txt(q.bank_holder, 20)); ch.push('예금주'); }
  if (q.qna_mode !== undefined) { if (['off', 'test', 'on'].indexOf(q.qna_mode) < 0) throw E_('bad', '문의 기능 상태가 올바르지 않아요.'); setSetting_('qna_mode', q.qna_mode); ch.push('문의'); }
  if (q.qna_testers !== undefined) { setSetting_('qna_testers', String(q.qna_testers).replace(/[^가-힣A-Za-z0-9,\s]/g, '').replace(/\s+/g, ' ').slice(0, 300)); ch.push('시험회원'); }
  if (q.join_mode !== undefined) { if (['on', 'off'].indexOf(q.join_mode) < 0) throw E_('bad', '직접 가입 상태가 올바르지 않아요.'); setSetting_('join_mode', q.join_mode); ch.push('직접가입'); }
  if (q.join_per_day !== undefined) { var jd = Math.round(Number(q.join_per_day)); if (!(jd >= 1 && jd <= 1000)) throw E_('bad', '하루 가입 한도는 1~1000 사이로 넣어 주세요.'); setSetting_('join_per_day', jd); ch.push('가입한도'); }
  if (q.ref_on !== undefined) { setSetting_('ref_on', q.ref_on ? 1 : 0); ch.push('추천보상'); }
  if (q.ref_days !== undefined) { var rd = Math.round(Number(q.ref_days)); if (!(rd >= 1 && rd <= 60)) throw E_('bad', '추천 보상은 1~60일 사이로 넣어 주세요.'); setSetting_('ref_days', rd); ch.push('보상일수'); }
  if (q.seats !== undefined) { var n = Math.round(Number(q.seats)); if (!(n >= 0 && n <= 1000)) throw E_('bad', '한 번에 쓸 수 있는 인원은 0~1000 사이로 넣어 주세요. (0 = 제한 없음)'); setSetting_('seats', n); ch.push('좌석'); }
  log_(ctx.u.nick, '설정 변경', ch.join(','));
  return aAdminCfg();
}
function aLogoPut(q, ctx) {
  var slot = q.slot === 'light' ? 'light' : (q.slot === 'dark' ? 'dark' : ''), data = String(q.data || '');
  if (!slot) throw E_('bad', '로고 종류가 올바르지 않아요.');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) throw E_('bad', '그림 파일(png, jpg, webp)만 올릴 수 있어요.');
  if (data.length > LIM.logoMax) throw E_('big', '그림이 너무 커요. 더 작은 파일을 골라 주세요.');
  delSettings_('logo_' + slot + '_');
  for (var i = 0, n = 0; i < data.length; i += LIM.cell, n++) append_('settings', ['logo_' + slot + '_' + n, data.slice(i, i + LIM.cell)]);
  var ver = num_(settings_().logo_ver) + 1; setSetting_('logo_ver', ver);
  log_(ctx.u.nick, '로고 변경', slot);
  return { ok: true, logoVer: ver };
}
function aLogoReset(q, ctx) {
  var slot = q.slot === 'light' ? 'light' : (q.slot === 'dark' ? 'dark' : ''); if (!slot) throw E_('bad', '로고 종류가 올바르지 않아요.');
  delSettings_('logo_' + slot + '_'); setSetting_('logo_ver', num_(settings_().logo_ver) + 1);
  log_(ctx.u.nick, '로고 되돌림', slot);
  return { ok: true };
}
/** 관리자 활동 기록(최근 100줄) */
function aLog(q) {
  var r = rows_('log'), out = [];
  for (var i = r.length - 1; i >= 0 && out.length < 100; i--) { var a = str_(r[i][2]); if (/로그인$/.test(a) && !q.all) continue; out.push({ ts: num_(r[i][0]), nick: str_(r[i][1]), act: a, info: str_(r[i][3]) }); }
  return { ok: true, list: out };
}

var H = {
  cfg:        { pub: 1, fn: aCfg },
  login:      { pub: 1, w: 1, fn: aLogin },
  me:         { mustOk: 1, fn: aMe },
  ping:       { mustOk: 1, fn: aPing },
  logout:     { w: 1, noSeat: 1, mustOk: 1, fn: aLogout },
  pin:        { w: 1, mustOk: 1, fn: aPin },
  setNick:    { w: 1, fn: aSetNick },
  setHome:    { w: 1, fn: aSetHome },
  useBranch:  { w: 1, mustOk: 1, fn: aUseBranch },
  courses:    { fn: aCourses },
  course:     { fn: aCourse },
  nameCheck:  { fn: aNameCheck },
  regFront:   { w: 1, reg: 1, fn: aRegFront },
  regBack:    { w: 1, reg: 1, fn: aRegBack },
  editCourse: { w: 1, fn: aEditCourse },
  delCourse:  { w: 1, fn: aDelCourse },
  save:       { w: 1, write: 1, fn: aSave },
  pub:        { w: 1, fn: aPub },
  prefs:      { fn: aPrefs },
  use:        { w: 1, write: 1, fn: aUse },
  unuse:      { w: 1, fn: aUnuse },
  trust:      { fn: aTrust },
  faqList:    { w: 1, fn: function (q, ctx) { seedFaq_(); return aFaqList(q, ctx); } },
  faqSave:    { w: 1, admin: 1, fn: aFaqSave },
  faqDel:     { w: 1, admin: 1, fn: aFaqDel },
  faqMove:    { w: 1, admin: 1, fn: aFaqMove },
  qnaList:    { fn: aQnaList },
  qnaGet:     { w: 1, fn: aQnaGet },
  qnaAsk:     { w: 1, fn: aQnaAsk },
  qnaReply:   { w: 1, fn: aQnaReply },
  qnaClose:   { w: 1, fn: aQnaClose },
  noticeList: { fn: aNoticeList },
  noticeSave: { w: 1, staff: 1, fn: aNoticeSave },
  noticeDel:  { w: 1, staff: 1, fn: aNoticeDel },
  payInfo:    { fn: aPayInfo },
  payReq:     { w: 1, fn: aPayReq },
  payCancel:  { w: 1, fn: aPayCancel },
  payList:    { admin: 1, fn: aPayList },
  payDecide:  { w: 1, admin: 1, fn: aPayDecide },
  payRefund:  { w: 1, admin: 1, fn: aPayRefund },
  members:    { staff: 1, fn: aMembers },
  mCreate:    { w: 1, staff: 1, fn: aMCreate },
  mUpdate:    { w: 1, staff: 1, fn: aMUpdate },
  dash:       { staff: 1, fn: aDash },
  branchList: { admin: 1, fn: aBranchList },
  branchSave: { w: 1, admin: 1, fn: aBranchSave },
  adminCfg:   { admin: 1, fn: aAdminCfg },
  setCfg:     { w: 1, admin: 1, fn: aSetCfg },
  logoPut:    { w: 1, admin: 1, fn: aLogoPut },
  logoReset:  { w: 1, admin: 1, fn: aLogoReset },
  log:        { admin: 1, fn: aLog },
  imgPut:     { w: 1, staff: 1, fn: aImgPut },
  refundInfo: { fn: aRefundInfo },
  refundReq:  { w: 1, fn: aRefundReq },
  refundCancel: { w: 1, fn: aRefundCancel },
  refundList: { admin: 1, fn: aRefundList },
  refundDecide: { w: 1, admin: 1, fn: aRefundDecide },
  imgGet:     { noSeat: 1, fn: aImgGet },
  joinCheck:  { pub: 1, fn: aJoinCheck },
  refName:    { pub: 1, fn: aRefName },
  join:       { pub: 1, w: 1, fn: aJoin },
  refInfo:    { fn: aRefInfo }
};

/* ───────────── 처음 설정·옮기기·관리 ───────────── */

/**
 * 처음 한 번, 그리고 새 버전 Code.gs 를 붙여 넣은 뒤 한 번 실행하세요(여러 번 실행해도 안전).
 * 시트 만들기, 비밀 열쇠, 매장, 관리자 계정, 예전(v1·v2) 자료 옮기기, 매일·매주 정리 예약.
 */
function setup() {
  resetMemo_();
  var ss = ss_();
  for (var name in SH) {
    var s = ss.getSheetByName(TITLE[name]);
    if (!s) s = ss.insertSheet(TITLE[name]);
    var cols = SH[name].length;
    if (s.getMaxColumns && s.getMaxColumns() < cols) s.insertColumnsAfter(s.getMaxColumns(), cols - s.getMaxColumns());
    s.getRange(1, 1, 1, cols).setNumberFormat('@');
    s.getRange(1, 1, 1, cols).setValues([SH[name]]);
    s.getRange(1, 1, Math.max(s.getMaxRows(), 2), cols).setNumberFormat('@');
    if (s.setFrozenRows) s.setFrozenRows(1);
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', rand_(40));
  var msg = '';
  if (!rows_('branches').length) {
    var st = settings_().store;
    SEED_BRANCHES.forEach(function (b, i) { append_('branches', [b[0], i === 0 && st ? st : b[1], 1, i + 1, Date.now()]); });
    cache_().remove('branches');
    msg += '매장 ' + SEED_BRANCHES.length + '곳을 만들었어요: ' + branches_().map(function (b) { return b.name; }).join(', ') + '\n';
  }
  msg += migrate_();
  seedFaq_();
  msg += seedPromo_();
  var adm = findUser_(ADMIN_NICK);
  if (!adm) {
    var pin = genPin_(6), salt = rand_(16);
    var u = { nick: ADMIN_NICK, kind: 'admin', start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0, ext: 0, seen: 0, uid: newUid_(), home: BRANCH, homeAt: 0, nickAt: 0, prev: '', prevUntil: 0, lastBr: BRANCH, lockN: 0, plen: 6 };
    u.hash = hashPin_(pin, salt);
    append_('users', userRow_(u));
    msg += '관리자 계정을 만들었어요.\n닉네임: ' + ADMIN_NICK + '\n처음 비밀번호: ' + pin + '\n(처음 들어가면 바로 나만의 비밀번호 6자리로 바꾸게 돼요. 이 번호는 다시 볼 수 없어요.)';
  } else {
    if (adm.kind !== 'admin') { adm.kind = 'admin'; adm.start = ''; adm.end = ''; adm.active = 1; saveUser_(adm); msg += '"' + ADMIN_NICK + '" 계정을 관리자로 바꿨어요.\n'; }
    else msg += '이미 준비되어 있어요.';
  }
  ['cfg', 'courses', 'branches'].forEach(function (k) { cache_().remove(k); });
  installTriggers_();
  tz_(ss);
  console.log(msg);
  tryUi_(SERVICE + ' 서버 준비 완료', msg);
  return msg;
}
/**
 * 예전 자료 옮기기(한 번만, 설정의 schema 로 표시)
 *  - v1: 고정회원 → 가입일부터 365일 연간, 기간회원 → 월간
 *  - v2 → v3: 회원번호(uid) 만들기, 모든 시트의 닉네임을 회원번호로, 기존 기록·신뢰도·문의는 첫 매장(양주점)으로, 운영진은 6자리 비밀번호로 바꾸게
 */
function migrate_() {
  var m = '', all = users_(), moved = [], ended = [];
  all.forEach(function (u) {
    if (u.kind === 'fixed') { var d = Utilities.formatDate(new Date(u.created || Date.now()), TZ, 'yyyy-MM-dd'); u.kind = 'year'; u.start = d; u.end = addDays_(d, PLAN.year.days - 1); saveUser_(u); moved.push(u.nick + '(연간)'); if (u.end < today_()) ended.push(u.nick); }
    else if (u.kind === 'term') { u.kind = 'month'; saveUser_(u); moved.push(u.nick + '(월간)'); }
  });
  if (moved.length) m += '예전 회원 ' + moved.length + '명을 새 등급으로 옮겼어요: ' + moved.join(', ') + '\n';
  if (ended.length) m += '가입한 지 1년이 넘어 바로 기간이 끝난 분: ' + ended.join(', ') + '\n';
  var cs = sheet_('courses'), n = cs.getLastRow();
  if (n >= 2) { var stg = cs.getRange(2, 9, n - 1, 1).getValues(); for (var i = 0; i < stg.length; i++) if (!str_(stg[i][0])) cs.getRange(i + 2, 9).setValue('done'); }
  if (num_(settings_().schema) >= 3) return m;

  /* v2 → v3 */
  var key = {}, cnt = 0;
  users_().forEach(function (u) {
    if (!u.uid) { u.uid = newUid_(); cnt++; }
    if (!u.home) u.home = BRANCH;
    if (!u.lastBr) u.lastBr = u.home;
    if (!u.plen) u.plen = 4;
    if (isStaff_(u) && u.plen < 6) u.must = 1;
    saveUser_(u);
    key[nickKey_(u.nick)] = u.uid;
  });
  var toUid = function (v) { var k = nickKey_(str_(v)); return key[k] || str_(v); };
  function conv(name, cols, extra) {
    var s = sheet_(name), last = s.getLastRow(); if (last < 2) return 0;
    var w = SH[name].length, rng = s.getRange(2, 1, last - 1, w), v = rng.getValues();
    v.forEach(function (r) { cols.forEach(function (c) { r[c] = toUid(r[c]); }); if (extra) extra(r); });
    rng.setNumberFormat('@'); rng.setValues(v);
    return v.length;
  }
  conv('sessions', [1]);
  conv('records', [1], function (r) { if (!str_(r[5])) r[5] = BRANCH; });
  conv('prefs', [0]);
  conv('payments', [1]);
  conv('uses', [0, 1], function (r) { if (!str_(r[5])) r[5] = BRANCH; });
  conv('qna', [1], function (r) {
    if (!str_(r[13])) r[13] = BRANCH;
    try { var msgs = JSON.parse(str_(r[9]) || '[]'); msgs.forEach(function (x) { x.by = toUid(x.by); }); r[9] = JSON.stringify(msgs); } catch (e) { /* 무시 */ }
  });
  conv('courses', [3, 7]);
  /* 결제의 name 칸: 신청 당시 닉네임(지금 닉네임으로 채움) */
  var nm = nickMap_(), ps = sheet_('payments'), pl = ps.getLastRow();
  if (pl >= 2) { var pr = ps.getRange(2, 1, pl - 1, 15), pv = pr.getValues(); pv.forEach(function (r) { if (!str_(r[14])) r[14] = nm[str_(r[1])] || ''; }); pr.setValues(pv); }
  ['seats', 'queue', 'courses', 'cfg'].forEach(function (k) { cache_().remove(k); });
  rows_('sessions').forEach(function (r) { cache_().remove('s:' + String(r[0])); });
  setSetting_('schema', 3);
  m += '통합 서버로 옮겼어요: 회원 ' + users_().length + '명에게 회원번호를 붙이고(' + cnt + '명 새로), 기존 기록은 "' + branchName_(BRANCH) + '" 기록으로 옮겼어요.\n운영자·관리자는 다음 로그인 때 비밀번호를 6자리로 바꾸게 돼요.\n';
  return m;
}
function tz_(ss) {
  var a = Session.getScriptTimeZone(), b = ss.getSpreadsheetTimeZone();
  if (a !== TZ || b !== TZ) { console.log('시간대 확인 필요: 스크립트 ' + a + ', 시트 ' + b); tryUi_('시간대를 확인해 주세요', '날짜가 하루 어긋나지 않으려면 스크립트와 시트의 시간대가 모두 ' + TZ + ' 이어야 해요.\n지금: 스크립트 ' + a + ', 시트 ' + b); }
}
/** 시트 오른쪽 아래에 잠깐 안내를 띄움(기다리지 않음). 내용은 항상 실행 로그에도 남습니다. */
function tryUi_(title, msg) { try { SpreadsheetApp.getActiveSpreadsheet().toast(String(msg).slice(0, 300), title, 30); } catch (e) { /* 화면이 없으면 실행 로그만 */ } }
function installTriggers_() {
  var ts = ScriptApp.getProjectTriggers(), has = {};
  for (var i = 0; i < ts.length; i++) has[ts[i].getHandlerFunction()] = 1;
  if (!has.dailyMaintenance) ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(4).create();
  if (!has.weeklyBackup) ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(5).create();
}

/** 개발자용: 관리자 비밀번호를 잊었을 때 새로 만듭니다(6자리). */
function devResetAdminPin() {
  resetMemo_();
  var u = findUser_(ADMIN_NICK) || users_().filter(function (x) { return x.kind === 'admin'; })[0];
  if (!u) { tryUi_('안내', '관리자 계정이 없어요. setup 을 실행해 주세요.'); return; }
  var pin = genPin_(6);
  u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0; u.lockN = 0; u.active = 1; u.kind = 'admin'; u.plen = 6;
  saveUser_(u); dropSessions_(u.uid);
  var m = u.nick + ' 의 새 비밀번호: ' + pin;
  console.log(m); tryUi_('관리자 비밀번호 다시 만들기', m);
  return m;
}

/** 매일 새벽: 만료된 로그인 정리, 문의 정리, 이력 정리, 백업 시트(최근 7일), 1년 지난 입금자 이름 가리기 */
function dailyMaintenance() {
  resetMemo_();
  var lock = LockService.getScriptLock(); if (!lock.tryLock(60000)) return;   // 회원 요청과 겹치지 않게
  try { dailyMaintenance_(); } finally { try { SpreadsheetApp.flush(); } catch (e) { /* 무시 */ } lock.releaseLock(); }
}
function dailyMaintenance_() {
  purgeSessions_();
  try { dropOrphanImgs_(); } catch (e) { console.error(e); }
  try { qnaMaintenance_(); } catch (e) { console.error(e); }
  try { maskOldDepositors_(); } catch (e) { console.error(e); }
  var s = sheet_('log'), n = s.getLastRow();
  if (n > LIM.logRows) s.deleteRows(2, n - LIM.logRows);
  var ss = ss_(), stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  ['records', 'courses', 'users', 'payments'].forEach(function (name) {
    var bn = 'bk' + stamp + '_' + TITLE[name];
    if (!ss.getSheetByName(bn)) { var cp = sheet_(name).copyTo(ss); cp.setName(bn); if (cp.hideSheet) cp.hideSheet(); }
  });
  var cut = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), TZ, 'yyMMdd');
  ss.getSheets().forEach(function (sh) { var m = /^bk(\d{6})_/.exec(sh.getName()); if (m && m[1] < cut) ss.deleteSheet(sh); });
}
/** 개인정보: 처리한 지 1년이 지난 결제의 입금자 이름을 가림 */
function maskOldDepositors_() {
  var s = sheet_('payments'), n = s.getLastRow(); if (n < 2) return;
  var rng = s.getRange(2, 6, n - 1, 1), dep = rng.getValues(), dec = s.getRange(2, 9, n - 1, 1).getValues(), cut = Date.now() - 365 * 86400000, ch = false;
  for (var i = 0; i < dep.length; i++) if (num_(dec[i][0]) && num_(dec[i][0]) < cut && str_(dep[i][0]) && str_(dep[i][0]) !== '*') { dep[i][0] = '*'; ch = true; }
  if (ch) rng.setValues(dep);
}
/** 매주(일요일 새벽): 구글 드라이브 "공략노트 백업" 폴더에 시트 전체 사본, 최근 8주 보관 */
function weeklyBackup() {
  resetMemo_();
  var name = '공략노트 백업', it = DriveApp.getFoldersByName(name), folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  DriveApp.getFileById(ss_().getId()).makeCopy('공략노트 백업 ' + stamp, folder);
  var files = [], fi = folder.getFiles();
  while (fi.hasNext()) { var f = fi.next(); if (/^공략노트 백업 \d{4}-\d{2}-\d{2}$/.test(f.getName())) files.push(f); }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  files.slice(LIM.backupWeeks).forEach(function (f) { f.setTrashed(true); });
  return files.length;
}
