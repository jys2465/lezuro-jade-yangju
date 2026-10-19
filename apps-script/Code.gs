/**
 * 레저로 파크골프 · 제이드 양주점 — 방향 기록장 서버 (구글 앱스크립트)
 *
 * 하는 일: 로그인/권한 확인, 코스·기록 저장, 회원 관리. 데이터는 이 구글 시트에 보관합니다.
 * 처음 한 번 setup() 을 실행하고, 웹 앱으로 배포하세요. (README 참고)
 *
 * 원칙
 *  - 모든 권한 검사는 서버에서 합니다. 화면에서 숨기는 것만으로는 믿지 않습니다.
 *  - 비밀번호(숫자 4자리)는 암호화(소금+후추+SHA-256)해서만 저장하고, 5번 틀리면 10분 잠급니다.
 *  - 오류는 항상 오류로 알립니다. 빈 데이터를 성공처럼 돌려주지 않습니다.
 */

var APP = 'lezuro-parkgolf';
var VER = 1;
var TZ = 'Asia/Seoul';
/** 처음 운영자 계정의 닉네임입니다. setup() 실행 전에 바꿔도 됩니다. */
var FIRST_OP_NICK = '운영자';

var LIM = {
  sessionDays: 60,        // 로그인 유지 기간
  extendLeftDays: 30,     // 남은 기간이 이보다 적으면 다시 60일로 늘림
  failMax: 5,             // 비밀번호 틀릴 수 있는 횟수
  lockMin: 10,            // 잠기는 시간(분)
  reqMax: 700000,         // 요청 최대 크기(글자)
  logoMax: 450000,        // 로고 한 장 최대 크기(글자)
  cell: 45000,            // 시트 칸 하나에 넣을 최대 글자(구글 시트 한도 50,000)
  logRows: 3000
};

var SH = {
  users:    ['nick', 'kind', 'start', 'end', 'hash', 'salt', 'must', 'active', 'fail', 'lock', 'created', 'last'],
  sessions: ['th', 'nick', 'exp', 'dev', 'created'],
  courses:  ['id', 'name', 'key', 'reg', 'holes', 'created', 'upd', 'updBy'],
  records:  ['cid', 'nick', 'filled', 'json', 'upd'],
  prefs:    ['nick', 'cid', 'pub'],
  settings: ['key', 'val'],
  log:      ['ts', 'nick', 'act', 'info']
};
var TITLE = {
  users: '회원', sessions: '로그인기록', courses: '코스', records: '기록', prefs: '공개설정', settings: '설정', log: '이력'
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
  try { return h.fn(q, ctx); } finally { lock.releaseLock(); }
}

function authed_(h, q) {
  var ctx = session_(String(q.t || ''));
  var st = ctx.st;
  if (h.op && ctx.u.kind !== 'op') throw E_('perm', '운영자만 할 수 있어요.');
  if (h.write && !canWrite_(st)) throw E_('expired', '이용 기간이 끝나서 할 수 없어요. 운영자에게 문의해 주세요.');
  if (h.reg && !canReg_(st)) throw E_('perm', '코스 등록은 고정회원부터 할 수 있어요.');
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
  var s = ss_().getSheetByName(TITLE[name]);
  if (!s) throw E_('setup', '서버 준비가 안 됐어요. 개발자에게 setup 실행을 요청해 주세요.');
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
  var s = sheet_('settings'), n = s.getLastRow();
  if (n >= 2) {
    var ks = s.getRange(2, 1, n - 1, 1).getValues();
    for (var i = 0; i < ks.length; i++) if (String(ks[i][0]) === key) { s.getRange(i + 2, 2).setValue(val); return; }
  }
  append_('settings', [key, val]);
}
function delSettings_(prefix) {
  rewrite_('settings', function (r) { return String(r[0]).indexOf(prefix) !== 0; });
}

/* ───────────── 회원·로그인 ───────────── */

function userOf_(r, i) {
  return {
    nick: str_(r[0]), kind: str_(r[1]), start: str_(r[2]), end: str_(r[3]), hash: str_(r[4]), salt: str_(r[5]),
    must: num_(r[6]), active: num_(r[7]), fail: num_(r[8]), lock: num_(r[9]), created: num_(r[10]), last: num_(r[11]), row: i + 2
  };
}
function userRow_(u) {
  return [u.nick, u.kind, u.start, u.end, u.hash, u.salt, u.must, u.active, u.fail, u.lock, u.created, u.last];
}
function users_() { return rows_('users').map(userOf_); }
function findUser_(nick) {
  var k = nickKey_(nick), all = users_();
  for (var i = 0; i < all.length; i++) if (nickKey_(all[i].nick) === k) return all[i];
  return null;
}
function saveUser_(u) { setRow_('users', u.row, userRow_(u)); }

/** 지금 이 회원의 상태: op | fixed | term_active | term_expired | term_wait */
function statusOf_(u) {
  if (u.kind === 'op' || u.kind === 'fixed') return u.kind;
  var t = today_();
  if (u.start && t < u.start) return 'term_wait';
  if (u.end && t > u.end) return 'term_expired';
  return 'term_active';
}
function canWrite_(st) { return st === 'op' || st === 'fixed' || st === 'term_active'; }
function canReg_(st) { return st === 'op' || st === 'fixed'; }
function canRead_(st) { return canWrite_(st); }
function userInfo_(u) {
  var st = statusOf_(u), t = today_();
  return {
    nick: u.nick, kind: u.kind, st: st, start: u.start, end: u.end,
    left: u.kind === 'term' && u.end ? diffDays_(t, u.end) : null, must: u.must ? 1 : 0
  };
}

function newSession_(u, dev) {
  var t = rand_(48), th = sha_(t), exp = Date.now() + LIM.sessionDays * 86400000;
  append_('sessions', [th, u.nick, exp, String(dev || '').slice(0, 60), Date.now()]);
  CacheService.getScriptCache().put('s:' + th, JSON.stringify({ n: u.nick, e: exp }), 21600);
  return t;
}
function session_(t) {
  if (!t) throw E_('auth', '다시 로그인해 주세요.');
  var th = sha_(t), cache = CacheService.getScriptCache(), hit = cache.get('s:' + th), s = null;
  if (hit) { try { s = JSON.parse(hit); } catch (e) { s = null; } }
  if (!s) {
    var r = rows_('sessions');
    for (var i = 0; i < r.length; i++) if (eq_(r[i][0], th)) { s = { n: str_(r[i][1]), e: num_(r[i][2]), row: i + 2 }; break; }
    if (s) cache.put('s:' + th, JSON.stringify({ n: s.n, e: s.e }), 21600);
  }
  if (!s || s.e < Date.now()) throw E_('auth', '로그인 기간이 끝났어요. 다시 로그인해 주세요.');
  var u = findUser_(s.n);
  if (!u || !u.active) throw E_('auth', '이 계정은 지금 쓸 수 없어요. 운영자에게 문의해 주세요.');
  var st = statusOf_(u);
  if (st === 'term_wait') throw E_('auth', '이용 시작일 전이에요.');
  if (s.e - Date.now() < LIM.extendLeftDays * 86400000) { // 자주 쓰는 분은 계속 로그인 유지
    var all = rows_('sessions');
    for (var j = 0; j < all.length; j++) if (eq_(all[j][0], th)) {
      var ne = Date.now() + LIM.sessionDays * 86400000;
      sheet_('sessions').getRange(j + 2, 3).setValue(ne);
      cache.put('s:' + th, JSON.stringify({ n: s.n, e: ne }), 21600);
      break;
    }
  }
  return { u: u, st: st, th: th };
}
function dropSessions_(nick) {
  var cache = CacheService.getScriptCache(), k = nickKey_(nick);
  rewrite_('sessions', function (r) {
    if (nickKey_(r[1]) === k) { cache.remove('s:' + String(r[0])); return false; }
    return true;
  });
}
function purgeSessions_() {
  var now = Date.now(), cache = CacheService.getScriptCache();
  rewrite_('sessions', function (r) {
    if (num_(r[2]) < now) { cache.remove('s:' + String(r[0])); return false; }
    return true;
  });
}

function aCfg(q) {
  var s = settings_(), ver = num_(s.logo_ver), out = { ok: true, store: s.store || '제이드 양주점', logoVer: ver, today: today_() };
  if (ver && Number(q.lv) !== ver) {
    out.logos = { dark: joinLogo_(s, 'dark'), light: joinLogo_(s, 'light') };
  }
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
  var st = statusOf_(u);
  if (st === 'term_wait') throw E_('wait', '이용 시작일(' + u.start + ')이 아직 안 됐어요.');
  u.fail = 0; u.lock = 0; u.last = now;
  saveUser_(u);
  var token = newSession_(u, q.dev);
  log_(u.nick, '로그인', '');
  return { ok: true, token: token, user: userInfo_(u) };
}

function aMe(q, ctx) {
  var s = settings_();
  return { ok: true, user: userInfo_(ctx.u), store: s.store || '제이드 양주점', today: today_() };
}
function aLogout(q, ctx) {
  rewrite_('sessions', function (r) { return !eq_(r[0], ctx.th); });
  CacheService.getScriptCache().remove('s:' + ctx.th);
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

/* ───────────── 코스·기록 ───────────── */

function courseOf_(r, i) {
  var holes = [];
  try { holes = JSON.parse(str_(r[4])); } catch (e) { holes = []; }
  return { id: str_(r[0]), name: str_(r[1]), key: str_(r[2]), reg: str_(r[3]), holes: holes, created: num_(r[5]), upd: num_(r[6]), updBy: str_(r[7]), row: i + 2 };
}
function courses_() { return rows_('courses').map(courseOf_); }
function findCourse_(id) {
  var all = courses_();
  for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}
function courseKey_(name) { return String(name).toLowerCase(); }
function okCourseName_(n) {
  return /^[^\s\u3000\u200b\ufeff=+\-@<>"'`\\][^\s\u3000\u200b\ufeff<>"'`\\]{1,29}$/.test(n);
}
function cleanHoles_(h) {
  if (!Array.isArray(h) || h.length !== 18) throw E_('bad', '18개 홀의 파와 거리를 모두 넣어 주세요.');
  var out = [];
  for (var i = 0; i < 18; i++) {
    var par = Number(h[i] && h[i][0]), m = Math.round(Number(h[i] && h[i][1]) * 10) / 10;
    if ([3, 4, 5].indexOf(par) < 0 || !isFinite(m) || m <= 0 || m > 999.9) {
      throw E_('bad', (i < 9 ? (i + 1) + '홀' : (i - 8) + '홀(' + (i + 1) + '홀)') + '의 파나 거리가 올바르지 않아요.');
    }
    out.push([par, m]);
  }
  return out;
}
function cleanRec_(r) {
  r = r || {};
  var ref = ['f', 'c', 'u'].indexOf(r.r) >= 0 ? r.r : '';
  var n = Math.max(0, Math.min(30, Math.round(Number(r.n) || 0)));
  var clean = function (s, max) { return String(s === undefined || s === null ? '' : s).replace(/[<>]/g, '').slice(0, max); };
  var p = Math.round(Number(r.p) || 0); if (p < 8 || p > 40) p = 0;     // 타격감: 17 = 50M, 1마다 5M (8~40)
  if (!ref) return { r: '', t: '', d: 'R', n: 0, p: 0, o: clean(r.o, 20) };
  return { r: ref, t: ref === 'u' ? clean(r.t, 10) : '', d: r.d === 'L' ? 'L' : 'R', n: n, p: p, o: clean(r.o, 20) };
}
function emptyRecs_() {
  var a = [];
  for (var i = 0; i < 18; i++) a.push({ r: '', t: '', d: 'R', n: 0, p: 0, o: '' });
  return a;
}
function parseRecs_(json) {
  var a;
  try { a = JSON.parse(json); } catch (e) { a = null; }
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

/** 이 회원이 지금 다른 회원에게 기록을 보여줄 수 있는 상태인지 */
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

function aCourses(q, ctx) {
  var list = courses_(), me = nickKey_(ctx.u.nick), see = canRead_(ctx.st);
  var recs = rows_('records'), mine = {}, others = {};
  var vis = visibleNicks_(users_()), priv = privateMap_();
  for (var i = 0; i < recs.length; i++) {
    var cid = String(recs[i][0]), nk = nickKey_(recs[i][1]), f = num_(recs[i][2]);
    if (nk === me) mine[cid] = f;
    else if (see && f > 0 && vis[nk] && !priv[nk + '|' + cid]) others[cid] = (others[cid] || 0) + 1;
  }
  var edit = function (c) { return ctx.u.kind === 'op' || (canReg_(ctx.st) && nickKey_(c.reg) === me); };
  return {
    ok: true,
    courses: list.map(function (c) { return { id: c.id, name: c.name, reg: c.reg, holes: c.holes, mine: mine[c.id] || 0, others: see ? (others[c.id] || 0) : 0, canEdit: edit(c) }; })
  };
}

function aCourse(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요. 지워졌을 수 있어요.');
  var mine = getRecs_(c.id, ctx.u.nick);
  var out = { ok: true, course: { id: c.id, name: c.name, reg: c.reg, holes: c.holes, canEdit: ctx.u.kind === 'op' || (canReg_(ctx.st) && nickKey_(c.reg) === nickKey_(ctx.u.nick)) }, mine: mine.recs, authors: [], pick: null };
  if (!canRead_(ctx.st)) return out;
  var vis = visibleNicks_(users_()), priv = privateMap_(), me = nickKey_(ctx.u.nick), rr = rows_('records'), list = [];
  for (var i = 0; i < rr.length; i++) {
    var nk = nickKey_(rr[i][1]);
    if (String(rr[i][0]) !== c.id || nk === me || num_(rr[i][2]) <= 0 || !vis[nk] || priv[nk + '|' + c.id]) continue;
    list.push({ nick: str_(rr[i][1]), filled: num_(rr[i][2]), upd: num_(rr[i][4]), json: str_(rr[i][3]) });
  }
  list.sort(function (a, b) { return b.upd - a.upd; });
  out.authors = list.map(function (a) { return { nick: a.nick, filled: a.filled }; });
  if (list.length) {
    var want = nickKey_(q.who || ''), pick = list[0];
    for (var j = 0; j < list.length; j++) if (nickKey_(list[j].nick) === want) pick = list[j];
    out.pick = { nick: pick.nick, recs: parseRecs_(pick.json) };
  }
  return out;
}

function aRegister(q, ctx) {
  var name = String(q.name === undefined ? '' : q.name);
  if (!okCourseName_(name)) throw E_('name', '코스 이름은 띄어쓰기 없이 2~30자로 적어 주세요. (예: 목행충주파크골프CD)');
  var holes = cleanHoles_(q.holes), key = courseKey_(name), all = courses_();
  for (var i = 0; i < all.length; i++) if (all[i].key === key) throw E_('dup', '이미 등록된 코스예요. 새로 등록할 수 없고, 그 코스를 쓰시면 돼요.', { id: all[i].id, name: all[i].name });
  var seq = num_(settings_().seq) + 1, id = 'c' + seq;
  setSetting_('seq', seq);
  append_('courses', [id, name, key, ctx.u.nick, JSON.stringify(holes), Date.now(), Date.now(), ctx.u.nick]);
  if (Array.isArray(q.recs)) {
    var recs = emptyRecs_();
    for (var k = 0; k < 18; k++) if (q.recs[k]) recs[k] = cleanRec_(q.recs[k]);
    if (filledOf_(recs) > 0) putRecs_(id, ctx.u.nick, recs);
  }
  log_(ctx.u.nick, '코스 등록', name);
  return { ok: true, id: id };
}

function aEditCourse(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  var isOp = ctx.u.kind === 'op';
  if (!(isOp || (canReg_(ctx.st) && nickKey_(c.reg) === nickKey_(ctx.u.nick)))) throw E_('perm', '처음 등록한 분이나 운영자만 고칠 수 있어요.');
  var name = c.name, key = c.key, holes = c.holes;
  if (q.holes !== undefined) holes = cleanHoles_(q.holes);
  if (q.name !== undefined && String(q.name) !== c.name) {
    if (!isOp) throw E_('perm', '코스 이름은 운영자만 바꿀 수 있어요.');
    name = String(q.name);
    if (!okCourseName_(name)) throw E_('name', '코스 이름은 띄어쓰기 없이 2~30자로 적어 주세요.');
    key = courseKey_(name);
    var all = courses_();
    for (var i = 0; i < all.length; i++) if (all[i].id !== c.id && all[i].key === key) throw E_('dup', '같은 이름의 코스가 이미 있어요.', { id: all[i].id, name: all[i].name });
  }
  setRow_('courses', c.row, [c.id, name, key, c.reg, JSON.stringify(holes), c.created, Date.now(), ctx.u.nick]);
  log_(ctx.u.nick, '코스 수정', c.name + (name !== c.name ? ' → ' + name : ''));
  return { ok: true };
}

function aDelCourse(q, ctx) {
  var c = findCourse_(q.id);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요.');
  rewrite_('courses', function (r) { return String(r[0]) !== c.id; });
  rewrite_('records', function (r) { return String(r[0]) !== c.id; });
  rewrite_('prefs', function (r) { return String(r[1]) !== c.id; });
  log_(ctx.u.nick, '코스 삭제', c.name);
  return { ok: true };
}

function aSave(q, ctx) {
  var c = findCourse_(q.cid);
  if (!c) throw E_('nocourse', '찾는 코스가 없어요. 지워졌을 수 있어요.');
  if (!Array.isArray(q.items) || !q.items.length || q.items.length > 18) throw E_('bad', '저장할 내용이 올바르지 않아요.');
  var cur = getRecs_(c.id, ctx.u.nick), recs = cur.recs;
  for (var i = 0; i < q.items.length; i++) {
    var it = q.items[i], idx = Number(it && it.i);
    if (!(idx >= 0 && idx < 18) || idx !== Math.floor(idx)) throw E_('bad', '홀 번호가 올바르지 않아요.');
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

/* ───────────── 회원 관리(운영자) ───────────── */

function memberView_(u) {
  var i = userInfo_(u);
  return { nick: u.nick, kind: u.kind, st: i.st, start: u.start, end: u.end, left: i.left, active: u.active ? 1 : 0, last: u.last, must: u.must ? 1 : 0 };
}
function aMembers() {
  var list = users_().map(memberView_);
  list.sort(function (a, b) { return a.nick < b.nick ? -1 : 1; });
  return { ok: true, members: list };
}
function opCount_(except) {
  var n = 0, all = users_();
  for (var i = 0; i < all.length; i++) if (all[i].kind === 'op' && all[i].active && nickKey_(all[i].nick) !== nickKey_(except || '')) n++;
  return n;
}
function setTerm_(u, days) {
  var t = today_();
  u.kind = 'term'; u.start = t; u.end = addDays_(t, days);
}
function cleanDays_(d, dflt) {
  d = Math.round(Number(d));
  if (!isFinite(d) || d < 1) return dflt;
  return Math.min(d, 730);
}
function aMCreate(q, ctx) {
  var nick = normNick_(q.nick);
  if (!okNick_(nick)) throw E_('nick', '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)');
  if (['fixed', 'term', 'op'].indexOf(q.kind) < 0) throw E_('bad', '회원 종류를 골라 주세요.');
  if (findUser_(nick)) throw E_('dupnick', '이미 있는 닉네임이에요.');
  var pin = genPin_(), salt = rand_(16);
  var u = { nick: nick, kind: q.kind, start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0 };
  u.hash = hashPin_(pin, salt);
  if (q.kind === 'term') setTerm_(u, cleanDays_(q.days, 30));
  append_('users', userRow_(u));
  log_(ctx.u.nick, '계정 만들기', nick + ' (' + q.kind + ')');
  return { ok: true, pin: pin, member: memberView_(u) };
}
function aMUpdate(q, ctx) {
  var u = findUser_(q.nick);
  if (!u) throw E_('nouser', '찾는 회원이 없어요.');
  var self = nickKey_(u.nick) === nickKey_(ctx.u.nick), op = q.op, out = { ok: true }, today = today_();
  if (op === 'kind') {
    if (self) throw E_('self', '내 계정의 종류는 바꿀 수 없어요.');
    if (['fixed', 'term', 'op'].indexOf(q.kind) < 0) throw E_('bad', '회원 종류를 골라 주세요.');
    if (u.kind === 'op' && q.kind !== 'op' && opCount_(u.nick) < 1) throw E_('lastop', '운영자가 한 명은 있어야 해요.');
    if (q.kind === 'term') setTerm_(u, cleanDays_(q.days, 30)); else { u.kind = q.kind; u.start = ''; u.end = ''; }
  } else if (op === 'extend') {
    if (u.kind !== 'term') throw E_('bad', '기간회원만 기간을 늘릴 수 있어요.');
    var base = u.end && u.end >= today ? u.end : today;
    u.end = addDays_(base, cleanDays_(q.days, 30));
    if (!u.start) u.start = today;
  } else if (op === 'pin') {
    var pin = genPin_();
    u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0;
    out.pin = pin;
    saveUser_(u);
    if (!self) dropSessions_(u.nick);
  } else if (op === 'active') {
    var on = q.on ? 1 : 0;
    if (!on && self) throw E_('self', '내 계정은 중지할 수 없어요.');
    if (!on && u.kind === 'op' && opCount_(u.nick) < 1) throw E_('lastop', '운영자가 한 명은 있어야 해요.');
    u.active = on;
    if (!on) dropSessions_(u.nick);
  } else if (op === 'delete') {
    if (self) throw E_('self', '내 계정은 지울 수 없어요.');
    if (u.kind === 'op' && opCount_(u.nick) < 1) throw E_('lastop', '운영자가 한 명은 있어야 해요.');
    var k = nickKey_(u.nick);
    dropSessions_(u.nick);
    rewrite_('records', function (r) { return nickKey_(r[1]) !== k; });
    rewrite_('prefs', function (r) { return nickKey_(r[0]) !== k; });
    rewrite_('users', function (r) { return nickKey_(r[0]) !== k; });
    log_(ctx.u.nick, '계정 삭제', u.nick);
    return out;
  } else throw E_('bad', '알 수 없는 요청이에요.');
  if (op !== 'pin') saveUser_(u);
  log_(ctx.u.nick, '회원 변경(' + op + ')', u.nick);
  out.member = memberView_(u);
  return out;
}

/* ───────────── 매장 이름·로고(운영자) ───────────── */

function aSetCfg(q, ctx) {
  var s = String(q.store === undefined ? '' : q.store).replace(/^\s+|\s+$/g, '').replace(/[<>]/g, '');
  if (s.length < 1 || s.length > 20) throw E_('bad', '매장 이름은 1~20자로 적어 주세요.');
  setSetting_('store', s);
  log_(ctx.u.nick, '매장 이름 변경', s);
  return { ok: true, store: s };
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
  logout:     { w: 1, fn: aLogout },
  pin:        { w: 1, fn: aPin },
  courses:    { fn: aCourses },
  course:     { fn: aCourse },
  register:   { w: 1, reg: 1, fn: aRegister },
  editCourse: { w: 1, fn: aEditCourse },
  delCourse:  { w: 1, op: 1, fn: aDelCourse },
  save:       { w: 1, write: 1, fn: aSave },
  pub:        { w: 1, fn: aPub },
  prefs:      { fn: aPrefs },
  members:    { op: 1, fn: aMembers },
  mCreate:    { w: 1, op: 1, fn: aMCreate },
  mUpdate:    { w: 1, op: 1, fn: aMUpdate },
  setCfg:     { w: 1, op: 1, fn: aSetCfg },
  logoPut:    { w: 1, op: 1, fn: aLogoPut },
  logoReset:  { w: 1, op: 1, fn: aLogoReset }
};

/* ───────────── 처음 설정·관리 ───────────── */

/**
 * 처음 한 번만 실행하세요. 시트 만들기, 비밀 열쇠 만들기, 첫 운영자 계정 만들기, 매일 정리 예약을 합니다.
 * 끝나면 첫 운영자의 닉네임과 처음 비밀번호가 화면(또는 실행 로그)에 나옵니다.
 */
function setup() {
  var ss = ss_();
  for (var name in SH) {
    var s = ss.getSheetByName(TITLE[name]);
    if (!s) s = ss.insertSheet(TITLE[name]);
    var cols = SH[name].length;
    s.getRange(1, 1, 1, cols).setNumberFormat('@');
    s.getRange(1, 1, 1, cols).setValues([SH[name]]);
    s.getRange(1, 1, Math.max(s.getMaxRows(), 2), cols).setNumberFormat('@');
    if (s.setFrozenRows) s.setFrozenRows(1);
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', rand_(40));
  var msg = '';
  if (!users_().length) {
    var pin = genPin_(), salt = rand_(16);
    var u = { nick: FIRST_OP_NICK, kind: 'op', start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0 };
    u.hash = hashPin_(pin, salt);
    append_('users', userRow_(u));
    msg = '첫 운영자 계정이 만들어졌어요.\n닉네임: ' + FIRST_OP_NICK + '\n처음 비밀번호: ' + pin + '\n(처음 들어가면 바로 나만의 비밀번호로 바꾸게 돼요. 이 번호는 다시 볼 수 없어요.)';
  } else msg = '이미 준비되어 있어요. (운영자 계정은 새로 만들지 않았어요)';
  installTriggers_();
  tz_(ss);
  console.log(msg);
  tryUi_('레저로 파크골프 서버 준비 완료', msg);
  return msg;
}
function tz_(ss) {
  var a = Session.getScriptTimeZone(), b = ss.getSpreadsheetTimeZone();
  if (a !== TZ || b !== TZ) tryUi_('시간대를 확인해 주세요', '날짜가 하루 어긋나지 않으려면 스크립트와 시트의 시간대가 모두 ' + TZ + ' 이어야 해요.\n지금: 스크립트 ' + a + ', 시트 ' + b);
}
function tryUi_(title, msg) {
  try { SpreadsheetApp.getUi().alert(title, msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* 화면이 없으면 실행 로그만 */ }
}
function installTriggers_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === 'dailyMaintenance') return;
  ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(4).create();
}

/** 개발자용: 모든 운영자가 비밀번호를 잊었을 때. 첫 운영자의 비밀번호를 새로 만듭니다. */
function devResetOperatorPin() {
  var u = findUser_(FIRST_OP_NICK);
  if (!u) { tryUi_('안내', FIRST_OP_NICK + ' 계정이 없어요.'); return; }
  var pin = genPin_();
  u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0; u.active = 1; u.kind = 'op';
  saveUser_(u);
  dropSessions_(u.nick);
  var m = u.nick + ' 의 새 비밀번호: ' + pin;
  console.log(m);
  tryUi_('운영자 비밀번호 다시 만들기', m);
}

/** 매일 새벽: 만료된 로그인 정리, 이력 정리, 하루 한 번 백업 시트 만들기(최근 7일 보관) */
function dailyMaintenance() {
  purgeSessions_();
  var s = sheet_('log'), n = s.getLastRow();
  if (n > LIM.logRows) s.deleteRows(2, n - LIM.logRows);
  var ss = ss_(), stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  ['records', 'courses', 'users'].forEach(function (name) {
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
