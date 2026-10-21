/**
 * 레저로 파크골프 · 제이드 양주점 — 방향 기록장 서버 (구글 앱스크립트)  v2
 *
 * 하는 일: 로그인·권한, 코스·기록 저장, 회원 등급(체험·월간·연간), 결제 확인, 동시 사용 좌석과 대기열.
 * 처음 한 번 setup() 을 실행하고, 웹 앱으로 배포하세요. (README 참고)
 *
 * 등급
 *  - admin(관리자, 개발자 1명): 모든 것
 *  - op(운영자): 체험회원 만들기·체험 연장·회원 비밀번호 다시 만들기·회원 보기
 *  - trial(체험 1일, 연장 최대 2회) · month(월간 30일) · year(연간 365일)
 *
 * 원칙
 *  - 모든 권한 검사는 서버에서 합니다.
 *  - 비밀번호(숫자 4자리)는 암호화해서만 저장하고, 5번 틀리면 10분 잠급니다.
 *  - 오류는 항상 오류로 알립니다.
 */

var APP = 'lezuro-parkgolf';
var VER = 2;
var TZ = 'Asia/Seoul';
/** 관리자(개발자) 닉네임. setup() 이 이 닉네임으로 관리자 계정을 만듭니다(이미 있으면 관리자로 바꿉니다). */
var ADMIN_NICK = '관리자';
/** 지점 코드(영문 소문자·숫자). 화면의 js/config.js 의 BRANCH 와 같아야 합니다.
 *  나중에 여러 지점을 운영할 때 지점을 구분하는 열쇠가 됩니다. (바꾸려면 '설정' 시트의 branch 값을 고치세요) */
var BRANCH = 'yangju';
/** 이 지점의 매장 이름 처음 값(관리자 설정에서 바꿀 수 있음). 새 지점은 BRANCH 와 함께 이 값만 바꾸고 setup 을 실행하세요. */
var STORE_DEFAULT = '제이드 양주점';
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
  sessionDays: 60, extendLeftDays: 30, failMax: 5, lockMin: 10,
  reqMax: 700000, logoMax: 450000, cell: 45000, logRows: 3000,
  idleMs: 10 * 60000,       // 10분 동안 아무 움직임이 없으면 좌석을 비움
  touchMs: 60000,           // 좌석·접속 표시는 1분에 한 번만 갱신(속도)
  seenSaveMs: 5 * 60000,    // "마지막 접속"을 시트에 남기는 간격
  queueStaleMs: 45000,      // 대기 화면이 45초 동안 확인하지 않으면 대기열에서 뺌
  renewDays: 14,            // 종료 14일 전부터 다시 결제 가능
  trialExtMax: 2,
  refundFullDays: 7
};

var SH = {
  users:    ['nick', 'kind', 'start', 'end', 'hash', 'salt', 'must', 'active', 'fail', 'lock', 'created', 'last', 'ext', 'seen'],
  sessions: ['th', 'nick', 'exp', 'dev', 'created'],
  courses:  ['id', 'name', 'key', 'reg', 'holes', 'created', 'upd', 'updBy', 'stage'],
  records:  ['cid', 'nick', 'filled', 'json', 'upd'],
  prefs:    ['nick', 'cid', 'pub'],
  payments: ['id', 'nick', 'plan', 'amount', 'method', 'depositor', 'status', 'created', 'decided', 'by', 'start', 'end', 'refund', 'refundAt'],
  settings: ['key', 'val'],
  log:      ['ts', 'nick', 'act', 'info'],
  uses:     ['owner', 'user', 'cid', 'first', 'last']   // 신뢰도: user 가 owner 의 cid 코스 기록을 가져다 씀(코스마다 1번)
};
var TITLE = {
  users: '회원', sessions: '로그인기록', courses: '코스', records: '기록', prefs: '공개설정', payments: '결제', settings: '설정', log: '이력', uses: '신뢰도'
};

/* ───────────── 입구 ───────────── */

function doGet() {
  return json_({ ok: true, app: APP, ver: VER });
}

function doPost(e) {
  var out;
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > LIM.reqMax) throw E_('big', '보내는 내용이 너무 커요');
    var q = JSON.parse(raw);
    var h = H[q.a];
    if (!h) throw E_('bad', '알 수 없는 요청이에요');
    if (q.b && String(q.b) !== String(cfg_().branch || BRANCH)) throw E_('branch', '이 앱 주소와 서버의 지점이 달라요. 개발자에게 js/config.js 의 지점 코드(BRANCH)를 확인해 달라고 해 주세요.');
    out = h.pub ? run_(h, null, q) : authed_(h, q);
  } catch (err) {
    if (err && err.lz) out = err.body;
    else {
      console.error(err && err.stack ? err.stack : String(err));
      out = { ok: false, err: 'server', msg: '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.' };
    }
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function E_(code, msg, extra) {
  var body = { ok: false, err: code, msg: msg };
  if (extra) for (var k in extra) body[k] = extra[k];
  return { lz: true, body: body };
}

/** 쓰기 요청은 한 번에 하나씩 처리합니다(동시에 저장해도 꼬이지 않게). */
function run_(h, ctx, q) {
  if (!h.w) return h.fn(q, ctx);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw E_('busy', '지금 다른 분이 저장 중이에요. 잠시 뒤에 다시 해 주세요.');
  try { return h.fn(q, ctx); }
  finally {
    try { SpreadsheetApp.flush(); } catch (e) { /* 무시 */ }   // ★ 잠금을 풀기 전에 시트에 바로 기록 — 다음 요청이 옛 내용을 읽지 않게(두 번 승인 방지)
    lock.releaseLock();
  }
}

function authed_(h, q) {
  var ctx = session_(String(q.t || ''));
  var u = ctx.u, st = ctx.st;
  if (!h.noSeat) seat_(u);                                   // 동시 사용 좌석(대기열)
  if (h.admin && u.kind !== 'admin') throw E_('perm', '관리자만 할 수 있어요.');
  if (h.staff && !isStaff_(u)) throw E_('perm', '운영자나 관리자만 할 수 있어요.');
  if (h.write && !canWrite_(st)) throw E_('expired', '이용 기간이 끝나서 할 수 없어요. 이용권을 결제해 주세요.');
  if (h.reg && !canReg_(u, st)) throw E_('perm', '코스 등록은 월간·연간회원부터 할 수 있어요.');
  return run_(h, ctx, q);
}

/* ───────────── 시간·문자 도구 ───────────── */

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function ymd_(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
function addDays_(s, n) {
  var p = s.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return ymd_(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function diffDays_(a, b) { // b - a (일)
  var x = a.split('-'), y = b.split('-');
  return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / 86400000);
}
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; s += ('0' + b.toString(16)).slice(-2); }
  return s;
}
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function eq_(a, b) { // 시간차 공격을 막기 위해 끝까지 비교
  a = String(a); b = String(b);
  var d = a.length === b.length ? 0 : 1, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function rand_(len) { // 안전한 무작위 16진 문자열
  var s = '';
  while (s.length < len) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, len);
}
function pepper_() {
  var p = PropertiesService.getScriptProperties();
  var v = p.getProperty('PEPPER');
  if (!v) throw E_('setup', '서버 준비가 안 됐어요. 개발자에게 setup 실행을 요청해 주세요.');
  return v;
}
function hashPin_(pin, salt) { return sha_(salt + ':' + pin + ':' + pepper_()); }
function genPin_() {
  for (var i = 0; i < 50; i++) {
    var p = ('0000' + (parseInt(rand_(8), 16) % 10000)).slice(-4);
    if (!weakPin_(p)) return p;
  }
  return '4721';
}
function weakPin_(p) {
  if (/^(\d)\1{3}$/.test(p)) return true;
  return ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210', '0000'].indexOf(p) >= 0;
}
function normNick_(s) { return String(s === undefined || s === null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function nickKey_(s) { return normNick_(s).toLowerCase(); }
function okNick_(s) { return /^[가-힣A-Za-z0-9]{2,8}$/.test(s); }

/* ───────────── 시트 읽기·쓰기 ───────────── */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  var ss = ss_(), s = ss.getSheetByName(TITLE[name]);
  if (s) return s;
  if (name === 'users' || name === 'settings') throw E_('setup', '서버 준비가 안 됐어요. 개발자에게 setup 실행을 요청해 주세요.');
  s = ss.insertSheet(TITLE[name]);                                         // 새 버전에서 생긴 탭(예: 신뢰도)은 setup 을 안 돌려도 저절로 만듦
  var cols = SH[name].length;
  s.getRange(1, 1, Math.max(s.getMaxRows(), 2), cols).setNumberFormat('@');
  s.getRange(1, 1, 1, cols).setValues([SH[name]]);
  if (s.setFrozenRows) s.setFrozenRows(1);
  return s;
}
function rows_(name) {
  var s = sheet_(name), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, SH[name].length).getValues();
}
function append_(name, row) {
  var s = sheet_(name), r = Math.max(s.getLastRow(), 1) + 1;
  if (r > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), Math.max(r - s.getMaxRows(), 200));
  var rng = s.getRange(r, 1, 1, SH[name].length);
  rng.setNumberFormat('@');
  rng.setValues([row]);
  return r;
}
function setRow_(name, r, row) {
  sheet_(name).getRange(r, 1, 1, SH[name].length).setValues([row]);
}
/** 조건에 맞는 줄만 남기고 다시 씁니다(삭제용). */
function rewrite_(name, keep) {
  var s = sheet_(name), n = s.getLastRow();
  if (n < 2) return 0;
  var all = s.getRange(2, 1, n - 1, SH[name].length).getValues(), out = [];
  for (var i = 0; i < all.length; i++) if (keep(all[i])) out.push(all[i]);
  if (out.length === all.length) return 0;
  s.getRange(2, 1, n - 1, SH[name].length).clearContent();
  if (out.length) {
    var rng = s.getRange(2, 1, out.length, SH[name].length);
    rng.setNumberFormat('@');
    rng.setValues(out);
  }
  return all.length - out.length;
}
function log_(nick, act, info) {
  try {
    append_('log', [Date.now(), nick || '', act, String(info || '').slice(0, 300)]);
  } catch (e) { /* 이력 기록 실패는 무시 */ }
}
function settings_() {
  var o = {}, r = rows_('settings');
  for (var i = 0; i < r.length; i++) o[String(r[i][0])] = String(r[i][1]);
  return o;
}
function setSetting_(key, val) {
  CacheService.getScriptCache().remove('cfg');
  var s = sheet_('settings'), n = s.getLastRow();
  if (n >= 2) {
    var ks = s.getRange(2, 1, n - 1, 1).getValues();
    for (var i = 0; i < ks.length; i++) if (String(ks[i][0]) === key) { s.getRange(i + 2, 2).setValue(val); return; }
  }
  append_('settings', [key, val]);
}
function delSettings_(prefix) {
  CacheService.getScriptCache().remove('cfg');
  rewrite_('settings', function (r) { return String(r[0]).indexOf(prefix) !== 0; });
}

/* ───────────── 빠른 읽기(캐시) ───────────── */

function cache_() { return CacheService.getScriptCache(); }
function cget_(k) { var v = cache_().get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function cput_(k, o, sec) { try { cache_().put(k, JSON.stringify(o), sec || 21600); } catch (e) { /* 너무 크면 캐시 안 함 */ } }
/** 설정(로고 그림 제외)은 5분 동안 캐시에서 읽습니다. */
function cfg_() {
  var c = cget_('cfg');
  if (c) return c;
  var all = settings_(), o = {};
  for (var k in PAY_DEFAULTS) o[k] = PAY_DEFAULTS[k];
  for (var k2 in all) if (k2.indexOf('logo_') !== 0 || k2 === 'logo_ver') o[k2] = all[k2];
  o.branch = all.branch || BRANCH;
  cput_('cfg', o, 300);
  return o;
}

/* ───────────── 회원 ───────────── */

function userOf_(r, i) {
  return {
    nick: str_(r[0]), kind: str_(r[1]), start: str_(r[2]), end: str_(r[3]), hash: str_(r[4]), salt: str_(r[5]),
    must: num_(r[6]), active: num_(r[7]), fail: num_(r[8]), lock: num_(r[9]), created: num_(r[10]), last: num_(r[11]),
    ext: num_(r[12]), seen: num_(r[13]), row: i + 2
  };
}
function userRow_(u) {
  return [u.nick, u.kind, u.start, u.end, u.hash, u.salt, u.must, u.active, u.fail, u.lock, u.created, u.last, u.ext || 0, u.seen || 0];
}
function users_() { return rows_('users').map(userOf_); }
function findUser_(nick) {
  var k = nickKey_(nick), all = users_();
  for (var i = 0; i < all.length; i++) if (nickKey_(all[i].nick) === k) return all[i];
  return null;
}
function saveUser_(u) { setRow_('users', u.row, userRow_(u)); }
function isStaff_(u) { return u.kind === 'admin' || u.kind === 'op'; }

/** 지금 상태: admin | op | active | expired | wait */
function statusOf_(u) {
  if (isStaff_(u)) return u.kind;
  var t = today_();
  if (u.start && t < u.start) return 'wait';
  if (!u.end || t > u.end) return 'expired';
  return 'active';
}
function canWrite_(st) { return st === 'admin' || st === 'op' || st === 'active'; }
function canRead_(st) { return canWrite_(st); }
function canReg_(u, st) { return isStaff_(u) || ((u.kind === 'month' || u.kind === 'year') && st === 'active'); }
function leftDays_(u) { return !isStaff_(u) && u.end ? diffDays_(today_(), u.end) : null; }
/** 결제할 수 있는지: 체험 중이거나, 기간이 끝났거나, 종료 14일 전부터 */
function canPay_(u) {
  if (isStaff_(u)) return { ok: false, why: '운영자·관리자는 결제하지 않아요.' };
  var st = statusOf_(u), left = leftDays_(u);
  if (u.kind === 'trial' || st === 'expired') return { ok: true };
  if (left !== null && left <= LIM.renewDays) return { ok: true };
  return { ok: false, why: '종료 ' + LIM.renewDays + '일 전부터 다시 결제할 수 있어요. (지금 D-' + left + ')', from: addDays_(u.end, -LIM.renewDays) };
}
function userInfo_(u) {
  var st = statusOf_(u);
  return { nick: u.nick, kind: u.kind, kindName: KIND_NAME[u.kind] || u.kind, st: st, start: u.start, end: u.end, left: leftDays_(u), must: u.must ? 1 : 0, ext: u.ext || 0 };
}

/* ───────────── 로그인 ───────────── */

function newSession_(u, dev) {
  var t = rand_(48), th = sha_(t), exp = Date.now() + LIM.sessionDays * 86400000;
  append_('sessions', [th, u.nick, exp, String(dev || '').slice(0, 60), Date.now()]);
  cput_('s:' + th, { n: u.nick, e: exp });
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
  var u = findUser_(s.n);
  if (!u || !u.active) throw E_('auth', '이 계정은 지금 쓸 수 없어요. 운영자에게 문의해 주세요.');
  var st = statusOf_(u);
  if (st === 'wait') throw E_('auth', '이용 시작일 전이에요.');
  if (s.e - Date.now() < LIM.extendLeftDays * 86400000) {
    var all = rows_('sessions');
    for (var j = 0; j < all.length; j++) if (eq_(all[j][0], th)) {
      var ne = Date.now() + LIM.sessionDays * 86400000;
      sheet_('sessions').getRange(j + 2, 3).setValue(ne);
      cput_('s:' + th, { n: s.n, e: ne });
      break;
    }
  }
  return { u: u, st: st, th: th };
}
function dropSessions_(nick) {
  var k = nickKey_(nick);
  rewrite_('sessions', function (r) {
    if (nickKey_(r[1]) === k) { cache_().remove('s:' + String(r[0])); return false; }
    return true;
  });
  freeSeat_(nick);
}
function purgeSessions_() {
  var now = Date.now();
  rewrite_('sessions', function (r) {
    if (num_(r[2]) < now) { cache_().remove('s:' + String(r[0])); return false; }
    return true;
  });
}

/* ───────────── 동시 사용 좌석과 대기열 ───────────── */
/* 좌석 수(설정 seats)를 넘으면 "대기 N번째"를 알려 줍니다. 10분 동안 움직임이 없으면 좌석을 비웁니다.
 * 운영자·관리자는 좌석을 쓰지 않고 바로 들어갑니다. 0 이면 제한 없음. */

function prune_(seats, queue, now) {
  for (var k in seats) if (now - seats[k] > LIM.idleMs) delete seats[k];
  return queue.filter(function (x) { return now - x.ts <= LIM.queueStaleMs && !seats[x.k]; });
}
function touchSeen_(u, now) {
  var k = nickKey_(u.nick), last = num_(cache_().get('seen:' + k));
  if (now - last < LIM.touchMs) return;
  cache_().put('seen:' + k, String(now), 21600);
  if (now - (u.seen || 0) > LIM.seenSaveMs) { try { sheet_('users').getRange(u.row, 14).setValue(now); u.seen = now; } catch (e) { /* 무시 */ } }
}
function seat_(u) {
  var now = Date.now();
  touchSeen_(u, now);
  if (isStaff_(u)) return;
  var cap = num_(cfg_().seats), k = nickKey_(u.nick);
  var seats = cget_('seats') || {};
  if (seats[k] && now - seats[k] < LIM.touchMs) return;          // 이미 좌석이 있고 최근에 갱신함 → 바로 통과
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;                                // 잠깐 붐비면 막지 않고 통과
  try {
    seats = cget_('seats') || {};
    var queue = prune_(seats, cget_('queue') || [], now), used = Object.keys(seats).length;
    if (seats[k] || !cap || (used < cap && (!queue.length || queue[0].k === k))) {
      seats[k] = now;
      queue = queue.filter(function (x) { return x.k !== k; });
      cput_('seats', seats); cput_('queue', queue);
      return;
    }
    var at = -1;
    for (var i = 0; i < queue.length; i++) if (queue[i].k === k) { queue[i].ts = now; at = i; }
    if (at < 0) { queue.push({ k: k, ts: now }); at = queue.length - 1; }
    cput_('queue', queue);
    throw E_('queue', '지금 이용하는 분이 많아요. 잠시만 기다려 주세요.', { pos: at + 1, ahead: at, waiting: queue.length, cap: cap });
  } finally { lock.releaseLock(); }
}
function freeSeat_(nick) {
  var k = nickKey_(nick), seats = cget_('seats') || {}, queue = cget_('queue') || [];
  delete seats[k];
  cput_('seats', seats); cput_('queue', queue.filter(function (x) { return x.k !== k; }));
  cache_().remove('seen:' + k);
}
function seatStat_() {
  var now = Date.now(), seats = cget_('seats') || {}, queue = prune_(seats, cget_('queue') || [], now);
  return { used: Object.keys(seats).length, cap: num_(cfg_().seats), waiting: queue.length };
}

/* ───────────── 공개·로그인 ───────────── */

function aCfg(q) {
  var c = cfg_(), ver = num_(c.logo_ver), out = { ok: true, store: c.store || STORE_DEFAULT, branch: c.branch || BRANCH, logoVer: ver, today: today_() };
  if (ver && Number(q.lv) !== ver) { var s = settings_(); out.logos = { dark: joinLogo_(s, 'dark'), light: joinLogo_(s, 'light') }; }
  return out;
}
function joinLogo_(s, slot) {
  var out = '', i = 0;
  while (s['logo_' + slot + '_' + i] !== undefined) { out += s['logo_' + slot + '_' + i]; i++; }
  return out || null;
}

function aLogin(q) {
  var nick = normNick_(q.nick), pin = String(q.pin === undefined ? '' : q.pin);
  if (!nick || !/^\d{4}$/.test(pin)) throw E_('bad', '닉네임과 비밀번호 숫자 4자리를 넣어 주세요.');
  var u = findUser_(nick), now = Date.now();
  if (!u) { hashPin_(pin, 'x'); throw E_('login', '닉네임이나 비밀번호가 맞지 않아요.'); }
  if (!u.active) throw E_('off', '이용이 중지된 계정이에요. 운영자에게 문의해 주세요.');
  if (u.lock > now) {
    var min = Math.ceil((u.lock - now) / 60000);
    throw E_('lock', '비밀번호를 여러 번 틀려서 ' + min + '분 동안 쉬어요. 급하면 운영자에게 말씀해 주세요.', { min: min });
  }
  if (!eq_(hashPin_(pin, u.salt), u.hash)) {
    u.fail += 1;
    var left = LIM.failMax - u.fail;
    if (left <= 0) { u.lock = now + LIM.lockMin * 60000; u.fail = 0; }
    saveUser_(u);
    log_(u.nick, '로그인 실패', '');
    if (left <= 0) throw E_('lock', '비밀번호를 ' + LIM.failMax + '번 틀려서 ' + LIM.lockMin + '분 동안 쉬어요.', { min: LIM.lockMin });
    throw E_('login', '닉네임이나 비밀번호가 맞지 않아요. (' + left + '번 더 틀리면 잠시 쉬어요)', { left: left });
  }
  if (statusOf_(u) === 'wait') throw E_('wait', '이용 시작일(' + u.start + ')이 아직 안 됐어요.');
  u.fail = 0; u.lock = 0; u.last = now;
  saveUser_(u);
  var token = newSession_(u, q.dev);
  log_(u.nick, '로그인', '');
  return { ok: true, token: token, user: userInfo_(u) };
}

function myPending_(nick) {
  var k = nickKey_(nick), r = rows_('payments');
  for (var i = r.length - 1; i >= 0; i--) if (nickKey_(r[i][1]) === k && str_(r[i][6]) === 'pending') return payOf_(r[i], i);
  return null;
}
function aMe(q, ctx) {
  var c = cfg_(), p = myPending_(ctx.u.nick);
  return { ok: true, user: userInfo_(ctx.u), store: c.store || STORE_DEFAULT, today: today_(), pay: canPay_(ctx.u), pending: p ? payView_(p) : null, trust: trustMap_()[nickKey_(ctx.u.nick)] || 0 };
}
function aPing() { return { ok: true }; }
function aLogout(q, ctx) {
  rewrite_('sessions', function (r) { return !eq_(r[0], ctx.th); });
  cache_().remove('s:' + ctx.th);
  freeSeat_(ctx.u.nick);
  return { ok: true };
}
function aPin(q, ctx) {
  var pin = String(q.pin === undefined ? '' : q.pin);
  if (!/^\d{4}$/.test(pin)) throw E_('bad', '숫자 4자리로 정해 주세요.');
  if (weakPin_(pin)) throw E_('weak', '너무 쉬운 번호예요. (1234, 0000 같은 번호는 쓸 수 없어요) 다른 숫자로 정해 주세요.');
  var u = ctx.u;
  u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 0; u.fail = 0; u.lock = 0;
  saveUser_(u);
  log_(u.nick, '비밀번호 변경', '');
  return { ok: true, user: userInfo_(u) };
}

/* ───────────── 코스 이름 규칙 ───────────── */
/* 한 칸 입력. 띄어쓰기는 지우고, 끝의 영문 대문자 1~2자(AB, CD …)는 "조합"으로 봅니다.
 *  - 이름이 완전히 같으면 거절(dup)
 *  - 영문 조합: 앞부분이 같고 조합이 다르면 새 코스. 앞부분이 기존 이름을 줄였거나 한 글자 다르면 고친 이름 제안(suggest)
 *  - 한글 등 그 밖의 끝: 앞 4글자 이상이 같은 코스가 있으면 "같은 구장의 다른 조합이 맞나요?" 확인(similar) — confirm 으로 등록 */

function normName_(s) { return String(s === undefined || s === null ? '' : s).replace(/[\s　​﻿]+/g, ''); }
function nameKey_(s) { return normName_(s).toLowerCase(); }
function okCourseName_(n) { return /^[^=+\-@<>"'`\\][^<>"'`\\]{1,29}$/.test(n); }
function splitCombo_(name) {
  var m = /^(.*?[^A-Za-z])([A-Z]{1,2})$/.exec(name);
  return m ? { base: m[1], combo: m[2] } : { base: name, combo: '' };
}
function lev1_(a, b) {     // 편집 거리가 1 이하인지
  if (a === b) return true;
  var la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return d + (la - i) + (lb - j) <= 1;
}
function abbrevOf_(short, long) {  // short 가 long 을 줄인 것(앞부분 또는 글자 순서대로 포함)인지
  if (short.length < 2 || short.length >= long.length) return false;
  if (long.indexOf(short) === 0) return true;
  var i = 0;
  for (var j = 0; j < long.length && i < short.length; j++) if (long[j] === short[i]) i++;
  return i === short.length && short[0] === long[0];
}
function commonPrefix_(a, b) { var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
/** 반환: null(통과) 또는 { code, msg, id, name, suggest } */
function nameCheck_(name, list, exceptId, confirm) {
  var key = nameKey_(name), sp = splitCombo_(normName_(name)), bk = sp.base.toLowerCase();
  for (var i = 0; i < list.length; i++) {
    var c = list[i]; if (c.id === exceptId) continue;
    if (c.key === key) return { code: 'dup', msg: '이미 등록된 코스예요. 새로 등록할 수 없고, 그 코스에 내 기록을 넣으시면 돼요.', id: c.id, name: c.name };
  }
  if (sp.combo) {
    for (var j = 0; j < list.length; j++) {
      var d = list[j]; if (d.id === exceptId) continue;
      var dp = splitCombo_(d.name), db = dp.base.toLowerCase();
      if (!dp.combo || db === bk) continue;                                // 앞부분이 같으면 다른 조합 → 통과
      var digitsDiffer = bk.replace(/\D/g, '') !== db.replace(/\D/g, '');     // 1구장·2구장처럼 숫자가 다르면 다른 코스
      if (!digitsDiffer && (abbrevOf_(bk, db) || (bk.length >= 3 && lev1_(bk, db)))) {
        var sug = dp.base + sp.combo;
        for (var x = 0; x < list.length; x++) if (list[x].key === nameKey_(sug) && list[x].id !== exceptId) return { code: 'dup', msg: '"' + list[x].name + '" 코스가 이미 있어요. 그 코스에 내 기록을 넣으시면 돼요.', id: list[x].id, name: list[x].name };
        return { code: 'suggest', msg: '"' + sug + '"로 등록할까요? (이미 "' + d.name + '"이 있어요)', suggest: sug, id: d.id, name: d.name };
      }
    }
    return null;
  }
  if (!confirm) {
    for (var y = 0; y < list.length; y++) {
      var e = list[y]; if (e.id === exceptId) continue;
      if (commonPrefix_(key, e.key) >= 4) return { code: 'similar', msg: '비슷한 코스가 있어요: "' + e.name + '". 같은 구장의 다른 조합이 맞나요?', id: e.id, name: e.name };
    }
  }
  return null;
}

/* ───────────── 코스·기록 ───────────── */

function courseOf_(r, i) {
  var holes = [];
  try { holes = JSON.parse(str_(r[4])); } catch (e) { holes = []; }
  return { id: str_(r[0]), name: str_(r[1]), key: str_(r[2]), reg: str_(r[3]), holes: holes, created: num_(r[5]), upd: num_(r[6]), updBy: str_(r[7]), stage: str_(r[8]) || 'done', row: i + 2 };
}
function courses_() {
  var c = cget_('courses');
  if (c) return c;
  var list = rows_('courses').map(courseOf_);
  cput_('courses', list, 600);
  return list;
}
function dropCourseCache_() { cache_().remove('courses'); }
function findCourse_(id) {
  var all = courses_();
  for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}
function mineCourse_(c, u) { return nickKey_(c.reg) === nickKey_(u.nick); }
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
  var p = Math.round(Number(r.p) || 0); if (p < 8 || p > 40) p = 17;     // 타격감: 기본 17(50M), 1마다 5M (8~40)
  if (!ref) return { r: '', t: '', d: 'R', n: 0, p: 17, o: clean(r.o, 20) };
  return { r: ref, t: ref === 'u' ? clean(r.t, 10) : '', d: r.d === 'L' ? 'L' : 'R', n: n, p: p, o: clean(r.o, 20) };
}
function emptyRecs_() { var a = []; for (var i = 0; i < 18; i++) a.push({ r: '', t: '', d: 'R', n: 0, p: 17, o: '' }); return a; }
function parseRecs_(json) {
  var a; try { a = JSON.parse(json); } catch (e) { a = null; }
  var out = emptyRecs_();
  if (Array.isArray(a)) for (var i = 0; i < 18; i++) if (a[i]) out[i] = cleanRec_(a[i]);
  return out;
}
function filledOf_(recs) { var n = 0; for (var i = 0; i < recs.length; i++) if (recs[i].r) n++; return n; }
function findRecRow_(cid, nick) {
  var s = sheet_('records'), n = s.getLastRow();
  if (n < 2) return null;
  var k = nickKey_(nick), v = s.getRange(2, 1, n - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === String(cid) && nickKey_(v[i][1]) === k) return i + 2;
  return null;
}
function getRecs_(cid, nick) {
  var r = findRecRow_(cid, nick);
  if (!r) return { recs: emptyRecs_(), row: null, upd: 0 };
  var v = sheet_('records').getRange(r, 1, 1, 5).getValues()[0];
  return { recs: parseRecs_(str_(v[3])), row: r, upd: num_(v[4]) };
}
function putRecs_(cid, nick, recs) {
  var row = [String(cid), nick, filledOf_(recs), JSON.stringify(recs), Date.now()];
  var r = findRecRow_(cid, nick);
  if (r) setRow_('records', r, row); else append_('records', row);
  return row[4];
}
function visibleNicks_(users) {
  var ok = {};
  for (var i = 0; i < users.length; i++) if (users[i].active && canRead_(statusOf_(users[i]))) ok[nickKey_(users[i].nick)] = true;
  return ok;
}
function privateMap_() {
  var m = {}, r = rows_('prefs');
  for (var i = 0; i < r.length; i++) if (num_(r[i][2]) === 0) m[nickKey_(r[i][0]) + '|' + String(r[i][1])] = true;
  return m;
}
function courseView_(c, u, st) {
  return { id: c.id, name: c.name, reg: c.reg, holes: c.holes, stage: c.stage, canEdit: canEditCourse_(c, u, st), mineReg: mineCourse_(c, u) };
}

function aCourses(q, ctx) {
  var u = ctx.u, me = nickKey_(u.nick), see = canRead_(ctx.st);
  var list = courses_().filter(function (c) { return canSeeCourse_(c, u); });
  var recs = rows_('records'), mine = {}, others = {}, vis = see ? visibleNicks_(users_()) : {}, priv = see ? privateMap_() : {};
  for (var i = 0; i < recs.length; i++) {
    var cid = String(recs[i][0]), nk = nickKey_(recs[i][1]), f = num_(recs[i][2]);
    if (nk === me) mine[cid] = f;
    else if (see && f > 0 && vis[nk] && !priv[nk + '|' + cid]) others[cid] = (others[cid] || 0) + 1;
  }
  return {
    ok: true, canReg: canReg_(u, ctx.st),
    courses: list.map(function (c) { var v = courseView_(c, u, ctx.st); v.mine = mine[c.id] || 0; v.others = see ? (others[c.id] || 0) : 0; return v; })
  };
}

function aCourse(q, ctx) {
  var c = findCourse_(q.id), u = ctx.u;
  if (!c || !canSeeCourse_(c, u)) throw E_('nocourse', '찾는 코스가 없어요. 지워졌을 수 있어요.');
  var out = { ok: true, course: courseView_(c, u, ctx.st), mine: getRecs_(c.id, u.nick).recs, authors: [], pick: null };
  if (!canRead_(ctx.st) || c.stage !== 'done') return out;
  var vis = visibleNicks_(users_()), priv = privateMap_(), me = nickKey_(u.nick), rr = rows_('records'), list = [];
  for (var i = 0; i < rr.length; i++) {
    var nk = nickKey_(rr[i][1]);
    if (String(rr[i][0]) !== c.id || nk === me || num_(rr[i][2]) <= 0 || !vis[nk] || priv[nk + '|' + c.id]) continue;
    list.push({ nick: str_(rr[i][1]), filled: num_(rr[i][2]), upd: num_(rr[i][4]), json: str_(rr[i][3]) });
  }
  var tm = trustMap_();
  list.forEach(function (a) { a.trust = tm[nickKey_(a.nick)] || 0; });
  list.sort(function (a, b) { return (b.trust - a.trust) || (b.filled - a.filled) || (b.upd - a.upd); });   // 신뢰도 높은 순
  out.authors = list.map(function (a) { return { nick: a.nick, filled: a.filled, trust: a.trust }; });
  if (list.length) {
    var want = nickKey_(q.who || ''), pick = list[0];
    for (var j = 0; j < list.length; j++) if (nickKey_(list[j].nick) === want) pick = list[j];
    out.pick = { nick: pick.nick, trust: pick.trust, recs: parseRecs_(pick.json) };
  }
  return out;
}

/** 이름만 미리 확인(등록 화면에서 입력할 때) */
function aNameCheck(q, ctx) {
  var name = normName_(q.name);
  if (!okCourseName_(name)) return { ok: true, res: { code: 'name', msg: '코스 이름은 2~30자로 적어 주세요. (예: 목행충주호파크골프CD)' } };
  return { ok: true, res: nameCheck_(name, courses_(), q.except || '', !!q.confirm) };
}

/** 1단계: 전반 9홀 저장 → 등록한 본인에게만 보이는 "후반 입력 필요" 코스가 생김 */
function aRegFront(q, ctx) {
  var name = normName_(q.name);
  if (!okCourseName_(name)) throw E_('name', '코스 이름은 2~30자로 적어 주세요. (예: 목행충주호파크골프CD)');
  var chk = nameCheck_(name, courses_(), '', !!q.confirm);
  if (chk) throw E_(chk.code, chk.msg, { id: chk.id, name: chk.name, suggest: chk.suggest });
  var front = cleanHalf_(q.holes, 0), holes = front.concat([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
  var seq = num_(settings_().seq) + 1, id = 'c' + seq;
  setSetting_('seq', seq);
  append_('courses', [id, name, nameKey_(name), ctx.u.nick, JSON.stringify(holes), Date.now(), Date.now(), ctx.u.nick, 'front']);
  dropCourseCache_();
  saveHalfRecs_(id, ctx.u.nick, q.recs, 0);
  log_(ctx.u.nick, '코스 전반 등록', name);
  return { ok: true, id: id, name: name };
}
/** 2단계: 후반 9홀 저장 → 모든 회원에게 보이는 코스가 됨 */
function aRegBack(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  if (!mineCourse_(c, ctx.u) && ctx.u.kind !== 'admin') throw E_('perm', '처음 등록한 분만 후반을 넣을 수 있어요.');
  if (c.stage === 'done') throw E_('done', '이미 18홀 등록이 끝난 코스예요.');
  var back = cleanHalf_(q.holes, 1), holes = c.holes.slice(0, 9).concat(back);
  setRow_('courses', c.row, [c.id, c.name, c.key, c.reg, JSON.stringify(holes), c.created, Date.now(), ctx.u.nick, 'done']);
  dropCourseCache_();
  saveHalfRecs_(c.id, ctx.u.nick, q.recs, 1);
  log_(ctx.u.nick, '코스 등록 완료', c.name);
  return { ok: true, id: c.id };
}
function saveHalfRecs_(cid, nick, recs, half) {
  if (!Array.isArray(recs)) return;
  var cur = getRecs_(cid, nick).recs, n = 0;
  for (var i = 0; i < 9; i++) if (recs[i] && recs[i].r) { cur[half * 9 + i] = cleanRec_(recs[i]); n++; }
  if (n) putRecs_(cid, nick, cur);
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
  setRow_('courses', c.row, [c.id, name, key, c.reg, JSON.stringify(holes), c.created, Date.now(), ctx.u.nick, c.stage]);
  dropCourseCache_();
  log_(ctx.u.nick, '코스 수정', c.name + (name !== c.name ? ' → ' + name : ''));
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
  var recs = getRecs_(c.id, ctx.u.nick).recs;
  for (var i = 0; i < q.items.length; i++) {
    var it = q.items[i], idx = Number(it && it.i);
    if (!(idx >= 0 && idx < 18) || idx !== Math.floor(idx)) throw E_('bad', '홀 번호가 올바르지 않아요.');
    if (c.stage !== 'done' && idx >= 9) throw E_('bad', '후반을 등록한 뒤에 기록할 수 있어요.');
    recs[idx] = cleanRec_(it.rec);
  }
  var upd = putRecs_(c.id, ctx.u.nick, recs);
  return { ok: true, upd: upd, filled: filledOf_(recs) };
}

function aPub(q, ctx) {
  var c = findCourse_(q.cid);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  var k = nickKey_(ctx.u.nick), pub = q.pub ? 1 : 0;
  rewrite_('prefs', function (r) { return !(nickKey_(r[0]) === k && String(r[1]) === c.id); });
  if (!pub) append_('prefs', [ctx.u.nick, c.id, 0]);
  return { ok: true, pub: pub };
}
function aPrefs(q, ctx) {
  var k = nickKey_(ctx.u.nick), r = rows_('prefs'), off = [];
  for (var i = 0; i < r.length; i++) if (nickKey_(r[i][0]) === k && num_(r[i][2]) === 0) off.push(String(r[i][1]));
  return { ok: true, off: off };
}

/* ───────────── 신뢰도: 다른 회원이 내 기록을 가져다 쓴 횟수 ─────────────
 * 같은 사람이 같은 코스에서 몇 번을 가져가도 1점(날짜만 가장 최근으로 바뀜). 코스가 다르면 따로 1점. */

function trustMap_() {
  var m = {}, r = rows_('uses');
  for (var i = 0; i < r.length; i++) { var k = nickKey_(r[i][0]); m[k] = (m[k] || 0) + 1; }
  return m;
}
function findUse_(owner, user, cid) {
  var r = rows_('uses'), o = nickKey_(owner), u = nickKey_(user);
  for (var i = 0; i < r.length; i++) if (nickKey_(r[i][0]) === o && nickKey_(r[i][1]) === u && String(r[i][2]) === String(cid)) return { row: i + 2, first: num_(r[i][3]), last: num_(r[i][4]) };
  return null;
}
/** 가져오기를 했을 때 화면이 알려 줌: { cid, from } */
function aUse(q, ctx) {
  var c = findCourse_(q.cid), me = ctx.u;
  if (!c || c.stage !== 'done') throw E_('nocourse', '찾는 코스가 없어요.');
  var src = findUser_(q.from);
  if (!src || nickKey_(src.nick) === nickKey_(me.nick)) throw E_('bad', '가져온 회원을 찾을 수 없어요.');
  var vis = visibleNicks_(users_()), priv = privateMap_(), k = nickKey_(src.nick);
  if (!vis[k] || priv[k + '|' + c.id] || !(getRecs_(c.id, src.nick).recs.some(function (r) { return r.r; }))) throw E_('bad', '이 코스에 공개된 기록이 없는 회원이에요.');
  var now = Date.now(), had = findUse_(src.nick, me.nick, c.id);
  if (had) sheet_('uses').getRange(had.row, 5).setValue(now);
  else append_('uses', [src.nick, me.nick, c.id, now, now]);
  return { ok: true, created: !had, trust: trustMap_()[k] || 0 };
}
/** 가져온 직후 되돌리기: 방금(30분 안) 새로 생긴 1점만 뺌 */
function aUnuse(q, ctx) {
  var had = findUse_(q.from, ctx.u.nick, q.cid);
  if (had && Date.now() - had.first < 30 * 60000) {
    rewrite_('uses', function (r) { return !(nickKey_(r[0]) === nickKey_(q.from) && nickKey_(r[1]) === nickKey_(ctx.u.nick) && String(r[2]) === String(q.cid)); });
    return { ok: true, removed: 1 };
  }
  return { ok: true, removed: 0 };
}
/** 신뢰도 목록: 언제(가장 최근), 누가, 어느 코스. 회원은 자기 것만, 운영자·관리자는 누구 것이나 */
function aTrust(q, ctx) {
  var nick = ctx.u.nick;
  if (q.nick && nickKey_(q.nick) !== nickKey_(nick)) {
    if (!isStaff_(ctx.u)) throw E_('perm', '내 신뢰도만 볼 수 있어요.');
    var who = findUser_(q.nick); if (!who) throw E_('nouser', '찾는 회원이 없어요.');
    nick = who.nick;
  }
  var names = {}; courses_().forEach(function (c) { names[c.id] = c.name; });
  var k = nickKey_(nick), list = rows_('uses').filter(function (r) { return nickKey_(r[0]) === k; }).map(function (r) {
    return { at: num_(r[4]), first: num_(r[3]), user: str_(r[1]), cid: str_(r[2]), course: names[str_(r[2])] || '(지워진 코스)' };
  });
  list.sort(function (a, b) { return b.at - a.at; });
  return { ok: true, nick: nick, trust: list.length, list: list };
}

/* ───────────── 결제 (닉네임 송금 + 관리자 승인) ───────────── */

function payOf_(r, i) {
  return { id: str_(r[0]), nick: str_(r[1]), plan: str_(r[2]), amount: num_(r[3]), method: str_(r[4]), depositor: str_(r[5]), status: str_(r[6]),
    created: num_(r[7]), decided: num_(r[8]), by: str_(r[9]), start: str_(r[10]), end: str_(r[11]), refund: num_(r[12]), refundAt: num_(r[13]), row: i + 2 };
}
function payRow_(p) { return [p.id, p.nick, p.plan, p.amount, p.method, p.depositor, p.status, p.created, p.decided, p.by, p.start, p.end, p.refund, p.refundAt]; }
function payView_(p) { var o = {}; for (var k in p) if (k !== 'row') o[k] = p[k]; o.planName = PLAN[p.plan] ? PLAN[p.plan].name : p.plan; return o; }
function pays_() { return rows_('payments').map(payOf_); }
function findPay_(id) { var a = pays_(); for (var i = 0; i < a.length; i++) if (a[i].id === String(id)) return a[i]; return null; }
function priceOf_(plan) { var c = cfg_(); return num_(plan === 'year' ? c.price_year : c.price_month); }

/** 결제 화면에 필요한 정보 */
function aPayInfo(q, ctx) {
  var c = cfg_(), p = myPending_(ctx.u.nick);
  return { ok: true, user: userInfo_(ctx.u), pay: canPay_(ctx.u), pending: p ? payView_(p) : null,
    prices: { month: priceOf_('month'), year: priceOf_('year') }, days: { month: PLAN.month.days, year: PLAN.year.days },
    qr: { month: c.qr_month || '', year: c.qr_year || '' }, bank: { name: c.bank_name || '', no: c.bank_no || '', holder: c.bank_holder || '' },
    preview: { month: periodFor_(ctx.u, 'month'), year: periodFor_(ctx.u, 'year') } };
}
/** 이 회원이 지금 결제하면 받을 기간 (체험 중이거나 끝났으면 오늘부터, 기간이 남았으면 이어 붙임) */
function periodFor_(u, plan) {
  var t = today_(), start = t;
  if ((u.kind === 'month' || u.kind === 'year') && u.end && u.end >= t) start = addDays_(u.end, 1);
  return { start: start, end: addDays_(start, PLAN[plan].days - 1) };
}
function aPayReq(q, ctx) {
  var u = ctx.u, plan = q.plan === 'year' ? 'year' : q.plan === 'month' ? 'month' : '';
  if (!plan) throw E_('bad', '이용권을 골라 주세요.');
  var can = canPay_(u); if (!can.ok) throw E_('nopay', can.why);
  var method = q.method === 'bank' ? 'bank' : 'kakao';
  var dep = String(q.depositor || u.nick).replace(/[<>]/g, '').replace(/^\s+|\s+$/g, '').slice(0, 10) || u.nick;
  var old = myPending_(u.nick);
  if (old) { old.status = 'cancel'; setRow_('payments', old.row, payRow_(old)); }
  var p = { id: 'p' + Date.now().toString(36) + rand_(4), nick: u.nick, plan: plan, amount: priceOf_(plan), method: method, depositor: dep, status: 'pending',
    created: Date.now(), decided: 0, by: '', start: '', end: '', refund: 0, refundAt: 0 };
  append_('payments', payRow_(p));
  log_(u.nick, '결제 신청', plan + ' ' + p.amount + '원 (' + method + ', ' + dep + ')');
  return { ok: true, pending: payView_(p) };
}
function aPayCancel(q, ctx) {
  var p = myPending_(ctx.u.nick);
  if (!p) throw E_('nopay', '확인 기다리는 결제가 없어요.');
  p.status = 'cancel'; setRow_('payments', p.row, payRow_(p));
  return { ok: true };
}
function aPayList(q) {
  var all = pays_(), pend = [], done = [];
  for (var i = all.length - 1; i >= 0; i--) { if (all[i].status === 'pending') pend.push(payView_(all[i])); else if (done.length < 40 && all[i].status !== 'cancel') done.push(payView_(all[i])); }
  pend.reverse();
  return { ok: true, pending: pend, recent: done };
}
function aPayDecide(q, ctx) {
  var p = findPay_(q.id);
  if (!p || p.status !== 'pending' || cache_().get('pd:' + p.id)) throw E_('nopay', '이미 처리된 결제예요. (두 번 누르셨을 수 있어요) 목록을 새로 불러올게요.');
  cache_().put('pd:' + p.id, '1', 21600);                                  // 같은 결제를 두 번 처리하지 않게 표시(시트보다 먼저 보임)
  var u = findUser_(p.nick);
  if (!q.ok || !u) {
    p.status = 'rejected'; p.decided = Date.now(); p.by = ctx.u.nick; setRow_('payments', p.row, payRow_(p));
    log_(ctx.u.nick, '결제 거절', p.nick + ' ' + p.amount + '원');
    return { ok: true, pay: payView_(p) };
  }
  var per = periodFor_(u, p.plan), append = (u.kind === 'month' || u.kind === 'year') && u.end && u.end >= today_();
  if (!append) u.start = per.start;
  u.end = per.end; u.kind = p.plan;
  saveUser_(u);
  p.status = 'ok'; p.decided = Date.now(); p.by = ctx.u.nick; p.start = per.start; p.end = per.end;
  setRow_('payments', p.row, payRow_(p));
  log_(ctx.u.nick, '결제 승인', p.nick + ' ' + PLAN[p.plan].name + ' ' + per.start + '~' + per.end);
  return { ok: true, pay: payView_(p), member: memberView_(u) };
}
/** 환불 계산: 7일 이내·기록 미사용이면 전액, 그 밖에는 남은 일수로 계산(100원 미만 버림) */
function refundCalc_(p) {
  var t = today_(), total = PLAN[p.plan].days;
  var used = t < p.start ? 0 : Math.min(total, diffDays_(p.start, t));
  var remain = total - used;
  var recUsed = rows_('records').some(function (r) { return nickKey_(r[1]) === nickKey_(p.nick) && num_(r[4]) >= p.decided; });
  if (Date.now() - p.decided < LIM.refundFullDays * 86400000 && !recUsed) return { amount: p.amount, remain: remain, total: total, full: true, why: '결제 후 ' + LIM.refundFullDays + '일 이내이고 기록을 쓰지 않아 전액 환불해요.' };
  var amt = Math.floor(p.amount * remain / total / 100) * 100;
  return { amount: amt, remain: remain, total: total, full: false, why: p.amount.toLocaleString() + '원 × 남은 ' + remain + '일 ÷ ' + total + '일 (100원 미만 버림)' };
}
function aPayRefund(q, ctx) {
  var p = findPay_(q.id);
  if (!p || p.status !== 'ok' || (q.confirm && cache_().get('rf:' + p.id))) throw E_('nopay', '환불할 수 있는 결제가 아니에요. (이미 처리됐을 수 있어요)');
  var later = pays_().filter(function (x) { return x.status === 'ok' && nickKey_(x.nick) === nickKey_(p.nick) && x.decided > p.decided; });
  if (later.length) throw E_('nopay', '이 회원의 가장 최근 결제부터 환불할 수 있어요.');
  var calc = refundCalc_(p);
  if (!q.confirm) return { ok: true, calc: calc };
  cache_().put('rf:' + p.id, '1', 21600);
  var u = findUser_(p.nick), t = today_();
  if (u) { u.end = t < p.start ? addDays_(p.start, -1) : addDays_(t, -1); saveUser_(u); }
  p.status = 'refunded'; p.refund = calc.amount; p.refundAt = Date.now(); setRow_('payments', p.row, payRow_(p));
  log_(ctx.u.nick, '환불', p.nick + ' ' + calc.amount + '원');
  return { ok: true, calc: calc, pay: payView_(p), member: u ? memberView_(u) : null };
}

/* ───────────── 회원 관리 ───────────── */

function memberView_(u, extra) {
  var i = userInfo_(u), o = { nick: u.nick, kind: u.kind, kindName: i.kindName, st: i.st, start: u.start, end: u.end, left: i.left, active: u.active ? 1 : 0, last: u.last, seen: u.seen, must: u.must ? 1 : 0, ext: u.ext || 0 };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
function aMembers(q, ctx) {
  var now = Date.now(), users = users_(), keys = users.map(function (u) { return 'seen:' + nickKey_(u.nick); });
  var seen = cache_().getAll ? cache_().getAll(keys) : {};
  var seats = cget_('seats') || {}, cnt = {}, rr = rows_('records'), pend = {}, tm = trustMap_();
  for (var i = 0; i < rr.length; i++) if (num_(rr[i][2]) > 0) { var k = nickKey_(rr[i][1]); cnt[k] = (cnt[k] || 0) + 1; }
  pays_().forEach(function (p) { if (p.status === 'pending') pend[nickKey_(p.nick)] = 1; });
  var list = users.map(function (u) {
    var k = nickKey_(u.nick), s = Math.max(num_(seen['seen:' + k]), u.seen || 0, seats[k] || 0);
    return memberView_(u, { seenAt: s, online: now - s < LIM.idleMs ? 1 : 0, courses: cnt[k] || 0, pendingPay: pend[k] || 0, trust: tm[k] || 0 });
  });
  var order = { admin: 0, op: 1, year: 2, month: 3, trial: 4 };
  list.sort(function (a, b) { return (b.online - a.online) || ((order[a.kind] || 9) - (order[b.kind] || 9)) || (a.nick < b.nick ? -1 : 1); });
  return { ok: true, members: list, seats: seatStat_(), me: ctx.u.kind };
}
function aMCreate(q, ctx) {
  var nick = normNick_(q.nick), kind = q.kind, isAdmin = ctx.u.kind === 'admin';
  if (!okNick_(nick)) throw E_('nick', '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)');
  if (['trial', 'month', 'year', 'op'].indexOf(kind) < 0) throw E_('bad', '회원 종류를 골라 주세요.');
  if (!isAdmin && kind !== 'trial') throw E_('perm', '운영자는 체험회원만 만들 수 있어요.');
  if (findUser_(nick)) throw E_('dupnick', '이미 있는 닉네임이에요.');
  var pin = genPin_(), salt = rand_(16), t = today_();
  var u = { nick: nick, kind: kind, start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0, ext: 0, seen: 0 };
  u.hash = hashPin_(pin, salt);
  if (kind === 'trial') { u.start = t; u.end = t; }
  if (kind === 'month' || kind === 'year') { u.start = t; u.end = addDays_(t, PLAN[kind].days - 1); }
  append_('users', userRow_(u));
  log_(ctx.u.nick, '계정 만들기', nick + ' (' + KIND_NAME[kind] + ')');
  return { ok: true, pin: pin, member: memberView_(u, { courses: 0, online: 0 }) };
}
function aMUpdate(q, ctx) {
  var u = findUser_(q.nick), me = ctx.u, isAdmin = me.kind === 'admin';
  if (!u) throw E_('nouser', '찾는 회원이 없어요.');
  if (u.kind === 'admin') throw E_('perm', '관리자 계정은 바꿀 수 없어요.');
  var self = nickKey_(u.nick) === nickKey_(me.nick), op = q.op, out = { ok: true }, t = today_();
  if (self) throw E_('self', '내 계정은 여기서 바꿀 수 없어요.');
  if (!isAdmin && (op !== 'trialExt' && op !== 'pin')) throw E_('perm', '이 기능은 관리자만 할 수 있어요.');
  if (!isAdmin && isStaff_(u)) throw E_('perm', '운영자 계정은 관리자만 관리할 수 있어요.');
  if (op === 'trialExt') {
    if (u.kind !== 'trial') throw E_('bad', '체험회원만 연장할 수 있어요.');
    if ((u.ext || 0) >= LIM.trialExtMax) throw E_('bad', '체험 연장은 ' + LIM.trialExtMax + '번까지만 할 수 있어요.');
    var base = u.end && u.end >= t ? u.end : addDays_(t, -1);
    u.end = addDays_(base, 1); u.ext = (u.ext || 0) + 1;
  } else if (op === 'kind') {
    if (['month', 'year', 'op'].indexOf(q.kind) < 0) throw E_('bad', '바꿀 회원 종류를 골라 주세요. (체험으로는 바꿀 수 없어요)');
    if (q.kind === 'op') { u.kind = 'op'; u.start = ''; u.end = ''; }
    else { u.kind = q.kind; u.start = t; u.end = addDays_(t, PLAN[q.kind].days - 1); }
  } else if (op === 'extend') {
    if (u.kind !== 'month' && u.kind !== 'year') throw E_('bad', '월간·연간회원만 기간을 늘릴 수 있어요.');
    var b2 = u.end && u.end >= t ? u.end : addDays_(t, -1);
    u.end = addDays_(b2, Math.max(1, Math.min(730, Math.round(Number(q.days) || 30))));
  } else if (op === 'pin') {
    var pin = genPin_();
    u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0;
    out.pin = pin; saveUser_(u); dropSessions_(u.nick);
  } else if (op === 'active') {
    u.active = q.on ? 1 : 0;
    if (!u.active) dropSessions_(u.nick);
  } else if (op === 'delete') {
    var k = nickKey_(u.nick);
    dropSessions_(u.nick);
    rewrite_('records', function (r) { return nickKey_(r[1]) !== k; });
    rewrite_('prefs', function (r) { return nickKey_(r[0]) !== k; });
    rewrite_('uses', function (r) { return nickKey_(r[0]) !== k && nickKey_(r[1]) !== k; });
    rewrite_('users', function (r) { return nickKey_(r[0]) !== k; });
    log_(me.nick, '계정 삭제', u.nick);
    return out;
  } else throw E_('bad', '알 수 없는 요청이에요.');
  if (op !== 'pin') saveUser_(u);
  log_(me.nick, '회원 변경(' + op + ')', u.nick);
  out.member = memberView_(u);
  return out;
}

/* ───────────── 관리자 설정 ───────────── */

function aAdminCfg() {
  var c = cfg_();
  return { ok: true, cfg: { branch: c.branch || BRANCH, store: c.store || STORE_DEFAULT, price_month: num_(c.price_month), price_year: num_(c.price_year), qr_month: c.qr_month || '', qr_year: c.qr_year || '',
    bank_name: c.bank_name || '', bank_no: c.bank_no || '', bank_holder: c.bank_holder || '', seats: num_(c.seats) }, seats: seatStat_() };
}
function aSetCfg(q, ctx) {
  var ch = [];
  function txt(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').replace(/^\s+|\s+$/g, '').slice(0, max); }
  if (q.store !== undefined) { var s = txt(q.store, 20); if (!s) throw E_('bad', '매장 이름을 적어 주세요.'); setSetting_('store', s); ch.push('매장'); }
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
  if (q.seats !== undefined) { var n = Math.round(Number(q.seats)); if (!(n >= 0 && n <= 1000)) throw E_('bad', '좌석 수는 0~1000 사이로 넣어 주세요. (0 = 제한 없음)'); setSetting_('seats', n); ch.push('좌석'); }
  log_(ctx.u.nick, '설정 변경', ch.join(','));
  return aAdminCfg();
}
function aLogoPut(q, ctx) {
  var slot = q.slot === 'light' ? 'light' : (q.slot === 'dark' ? 'dark' : '');
  var data = String(q.data || '');
  if (!slot) throw E_('bad', '로고 종류가 올바르지 않아요.');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) throw E_('bad', '그림 파일(png, jpg, webp)만 올릴 수 있어요.');
  if (data.length > LIM.logoMax) throw E_('big', '그림이 너무 커요. 더 작은 파일을 골라 주세요.');
  delSettings_('logo_' + slot + '_');
  for (var i = 0, n = 0; i < data.length; i += LIM.cell, n++) append_('settings', ['logo_' + slot + '_' + n, data.slice(i, i + LIM.cell)]);
  var ver = num_(settings_().logo_ver) + 1;
  setSetting_('logo_ver', ver);
  log_(ctx.u.nick, '로고 변경', slot);
  return { ok: true, logoVer: ver };
}
function aLogoReset(q, ctx) {
  var slot = q.slot === 'light' ? 'light' : (q.slot === 'dark' ? 'dark' : '');
  if (!slot) throw E_('bad', '로고 종류가 올바르지 않아요.');
  delSettings_('logo_' + slot + '_');
  setSetting_('logo_ver', num_(settings_().logo_ver) + 1);
  log_(ctx.u.nick, '로고 되돌림', slot);
  return { ok: true };
}

var H = {
  cfg:        { pub: 1, fn: aCfg },
  login:      { pub: 1, w: 1, fn: aLogin },
  me:         { fn: aMe },
  ping:       { fn: aPing },
  logout:     { w: 1, noSeat: 1, fn: aLogout },
  pin:        { w: 1, fn: aPin },
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
  payInfo:    { fn: aPayInfo },
  payReq:     { w: 1, fn: aPayReq },
  payCancel:  { w: 1, fn: aPayCancel },
  payList:    { admin: 1, fn: aPayList },
  payDecide:  { w: 1, admin: 1, fn: aPayDecide },
  payRefund:  { w: 1, admin: 1, fn: aPayRefund },
  members:    { staff: 1, fn: aMembers },
  mCreate:    { w: 1, staff: 1, fn: aMCreate },
  mUpdate:    { w: 1, staff: 1, fn: aMUpdate },
  adminCfg:   { admin: 1, fn: aAdminCfg },
  setCfg:     { w: 1, admin: 1, fn: aSetCfg },
  logoPut:    { w: 1, admin: 1, fn: aLogoPut },
  logoReset:  { w: 1, admin: 1, fn: aLogoReset }
};

/* ───────────── 처음 설정·옮기기·관리 ───────────── */

/**
 * 처음 한 번 실행하세요(다시 실행해도 안전). 시트 만들기, 비밀 열쇠, 관리자 계정, 예전 회원 옮기기, 매일 정리 예약.
 * 관리자를 새로 만들면 처음 비밀번호가 화면(또는 실행 로그)에 나옵니다.
 */
function setup() {
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
  var msg = migrate_();
  if (settings_().branch === undefined) setSetting_('branch', BRANCH);     // 지점 코드를 '설정' 시트에 남겨 둠
  if (settings_().store === undefined) setSetting_('store', STORE_DEFAULT);
  var adm = findUser_(ADMIN_NICK);
  if (!adm) {
    var pin = genPin_(), salt = rand_(16);
    var u = { nick: ADMIN_NICK, kind: 'admin', start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0, ext: 0, seen: 0 };
    u.hash = hashPin_(pin, salt);
    append_('users', userRow_(u));
    msg += '관리자 계정을 만들었어요.\n닉네임: ' + ADMIN_NICK + '\n처음 비밀번호: ' + pin + '\n(처음 들어가면 바로 나만의 비밀번호로 바꾸게 돼요. 이 번호는 다시 볼 수 없어요.)';
  } else {
    if (adm.kind !== 'admin') { adm.kind = 'admin'; adm.start = ''; adm.end = ''; adm.active = 1; saveUser_(adm); msg += '"' + ADMIN_NICK + '" 계정을 관리자로 바꿨어요.\n'; }
    else msg += '이미 준비되어 있어요.';
  }
  cache_().remove('cfg'); dropCourseCache_();
  installTriggers_();
  tz_(ss);
  console.log(msg);
  tryUi_('레저로 파크골프 서버 준비 완료', msg);
  return msg;
}
/** 예전 버전 자료를 새 등급으로 옮김: 고정회원 → 가입한 날부터 365일 연간회원, 기간회원 → 월간회원(기간 그대로) */
function migrate_() {
  var all = users_(), moved = [], ended = [];
  all.forEach(function (u) {
    if (u.kind === 'fixed') {
      var d = Utilities.formatDate(new Date(u.created || Date.now()), TZ, 'yyyy-MM-dd');
      u.kind = 'year'; u.start = d; u.end = addDays_(d, PLAN.year.days - 1);
      saveUser_(u); moved.push(u.nick + '(연간)');
      if (u.end < today_()) ended.push(u.nick);
    } else if (u.kind === 'term') {
      u.kind = 'month'; saveUser_(u); moved.push(u.nick + '(월간)');
    }
  });
  var cs = sheet_('courses'), n = cs.getLastRow();
  if (n >= 2) {
    var st = cs.getRange(2, 9, n - 1, 1).getValues();
    for (var i = 0; i < st.length; i++) if (!str_(st[i][0])) cs.getRange(i + 2, 9).setValue('done');
  }
  var m = '';
  if (moved.length) m += '예전 회원 ' + moved.length + '명을 새 등급으로 옮겼어요: ' + moved.join(', ') + '\n';
  if (ended.length) m += '가입한 지 1년이 넘어 바로 기간이 끝난 분: ' + ended.join(', ') + '\n';
  return m;
}
function tz_(ss) {
  var a = Session.getScriptTimeZone(), b = ss.getSpreadsheetTimeZone();
  if (a !== TZ || b !== TZ) { console.log('시간대 확인 필요: 스크립트 ' + a + ', 시트 ' + b); } if (a !== TZ || b !== TZ) tryUi_('시간대를 확인해 주세요', '날짜가 하루 어긋나지 않으려면 스크립트와 시트의 시간대가 모두 ' + TZ + ' 이어야 해요.\n지금: 스크립트 ' + a + ', 시트 ' + b);
}
/** 시트 오른쪽 아래에 잠깐 안내를 띄움(기다리지 않음). 내용은 항상 실행 로그에도 남습니다.
 *  ※ 예전에는 확인 창(alert)을 썼는데, 편집기에서 실행하면 시트 탭에서 "확인"을 누를 때까지 멈춰 6분 뒤 시간 초과가 났어요. */
function tryUi_(title, msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(String(msg).slice(0, 300), title, 30); } catch (e) { /* 화면이 없으면 실행 로그만 */ }
}
function installTriggers_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === 'dailyMaintenance') return;
  ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(4).create();
}

/** 개발자용: 관리자 비밀번호를 잊었을 때 새로 만듭니다. */
function devResetAdminPin() {
  var u = findUser_(ADMIN_NICK);
  if (!u) { tryUi_('안내', ADMIN_NICK + ' 계정이 없어요. setup 을 실행해 주세요.'); return; }
  var pin = genPin_();
  u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0; u.active = 1; u.kind = 'admin';
  saveUser_(u);
  dropSessions_(u.nick);
  var m = u.nick + ' 의 새 비밀번호: ' + pin;
  console.log(m);
  tryUi_('관리자 비밀번호 다시 만들기', m);
}

/** 매일 새벽: 만료된 로그인 정리, 이력 정리, 백업 시트(최근 7일 보관) */
function dailyMaintenance() {
  purgeSessions_();
  var s = sheet_('log'), n = s.getLastRow();
  if (n > LIM.logRows) s.deleteRows(2, n - LIM.logRows);
  var ss = ss_(), stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  ['records', 'courses', 'users', 'payments'].forEach(function (name) {
    var bn = 'bk' + stamp + '_' + TITLE[name];
    if (!ss.getSheetByName(bn)) {
      var cp = sheet_(name).copyTo(ss);
      cp.setName(bn);
      if (cp.hideSheet) cp.hideSheet();
    }
  });
  var cut = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), TZ, 'yyMMdd');
  ss.getSheets().forEach(function (sh) {
    var m = /^bk(\d{6})_/.exec(sh.getName());
    if (m && m[1] < cut) ss.deleteSheet(sh);
  });
}
