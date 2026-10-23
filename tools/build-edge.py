#!/usr/bin/env python3
"""apps-script/Code.gs → supabase/functions/api/core.js (수파베이스용 서버 로직)

Code.gs 의 업무 규칙(로그인·결제·환불·추천…)은 그대로 두고, 저장하는 부분만 수파베이스 엔진(ST)으로 바꿉니다.
Code.gs 를 고치면 이 파일을 다시 실행하세요:  python3 tools/build-edge.py
결과
  supabase/functions/api/core.js        (엔진이 불러 쓰는 서버 로직)
  supabase/붙여넣기/index.ts             (수파베이스 화면 편집기에 통째로 붙여 넣는 한 파일)
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'apps-script', 'Code.gs'), encoding='utf-8').read()


def sub(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit('바꿀 곳을 찾지 못했어요(%d곳): %r' % (n, old[:90]))
    src = src.replace(old, new)


def cut(start, end, new):
    """start 부터 end 바로 앞까지를 new 로"""
    global src
    a = src.find(start)
    b = src.find(end, a + 1) if end else len(src)
    if a < 0 or b < 0:
        sys.exit('구간을 찾지 못했어요: %r' % start[:60])
    src = src[:a] + new + src[b:]


# 1) 시트 읽기·쓰기 → 엔진
cut('/* ───────────── 시트 읽기·쓰기 ───────────── */', '/* ───────────── 캐시 ───────────── */', r'''/* ───────────── 저장소(수파베이스) ─────────────
 * 엔진(ST)이 필요한 표를 미리 읽어 둡니다. 여기서는 예전 시트처럼 "줄 번호"로 읽고 씁니다(2번 줄부터). */
function resetMemo_() { }
function rows_(name) { return ST.rows(name); }
function append_(name, row) { return ST.append(name, row); }
function setRow_(name, r, row) { ST.setRow(name, r, row); }
function setCell_(name, r, c, v) { ST.setCell(name, r, c, v); }
function rewrite_(name, keep) { return ST.rewrite(name, keep); }
function log_(nick, act, info) { try { append_('log', [Date.now(), nick || '', act, String(info || '').slice(0, 300)]); } catch (e) { /* 무시 */ } }
function settings_() { var o = {}, r = rows_('settings'); for (var i = 0; i < r.length; i++) o[String(r[i][0])] = String(r[i][1]); return o; }
function setSetting_(key, val) {
  var r = rows_('settings');
  for (var i = 0; i < r.length; i++) if (String(r[i][0]) === key) { setCell_('settings', i + 2, 2, val); return; }
  append_('settings', [key, val]);
}
function delSettings_(prefix) { rewrite_('settings', function (r) { return String(r[0]).indexOf(prefix) !== 0; }); }

''')

# 2) 칸 하나 쓰기
sub("sheet_('sessions').getRange(i + 2, 6).setValue(now);", "setCell_('sessions', i + 2, 6, now);")
sub("sheet_('sessions').getRange(j + 2, 3).setValue(ne);", "setCell_('sessions', j + 2, 3, ne);")
sub("try { sheet_('users').getRange(u.row, 14).setValue(now); u.seen = now; } catch (e) { /* 무시 */ }", "setCell_('users', u.row, 14, now); u.seen = now;")
sub("sheet_('users').getRange(u.row, 21).setValue(ctx.br);", "setCell_('users', u.row, 21, ctx.br);")
sub("if (had) sheet_('uses').getRange(had.row, 5).setValue(now);", "if (had) setCell_('uses', had.row, 5, now);")
sub("all.forEach(function (x, k) { sheet_('faq').getRange(x.row, 2).setValue(k + 1); });", "all.forEach(function (x, k) { setCell_('faq', x.row, 2, k + 1); });")
sub("if (!(sheet_('faq').getLastRow() > 1 || st.faq_seeded)) {", "if (!(rows_('faq').length > 0 || st.faq_seeded)) {")

# 3) 로고: 큰 그림이라 설정 표와 따로(logos)
sub("function joinLogo_(s, slot) { var out = '', i = 0; while (s['logo_' + slot + '_' + i] !== undefined) { out += s['logo_' + slot + '_' + i]; i++; } return out || null; }",
    "function joinLogo_(s, slot) {\n  var pre = 'logo_' + slot + '_', l = ST.part('logos', { pre: pre }).map(function (x) { return x.a; });\n"
    "  l.sort(function (a, b) { return num_(String(a[0]).slice(pre.length)) - num_(String(b[0]).slice(pre.length)); });\n"
    "  return l.map(function (r) { return str_(r[1]); }).join('') || null;\n}")
sub("delSettings_('logo_' + slot + '_');\n  for (var i = 0, n = 0; i < data.length; i += LIM.cell, n++) append_('settings', ['logo_' + slot + '_' + n, data.slice(i, i + LIM.cell)]);",
    "ST.partDel('logos', { pre: 'logo_' + slot + '_' });\n  for (var i = 0, n = 0; i < data.length; i += LIM.cell, n++) append_('logos', ['logo_' + slot + '_' + n, data.slice(i, i + LIM.cell)]);")
sub("delSettings_('logo_' + slot + '_'); setSetting_('logo_ver'", "ST.partDel('logos', { pre: 'logo_' + slot + '_' }); setSetting_('logo_ver'")

# 4) 기록(records): 필요한 부분만 읽음
cut('function findRecRow_(cid, uid, br) {', 'function visibleUids_(users) {', r'''function recOf_(cid, uid, br) { return ST.part('records', { cid: String(cid), uid: uid, br: br })[0] || null; }
function getRecs_(cid, uid, br) {
  var x = recOf_(cid, uid, br);
  if (!x) return { recs: emptyRecs_(), row: null, upd: 0 };
  return { recs: parseRecs_(str_(x.a[3])), row: x.id, upd: num_(x.a[4]) };
}
function putRecs_(cid, uid, br, recs) {
  var row = [String(cid), uid, filledOf_(recs), JSON.stringify(recs), Date.now(), br];
  var x = recOf_(cid, uid, br);
  ST.partPut('records', x ? x.id : 0, row);
  return row[4];
}
/** 코스 목록용: 이 매장 기록 + 내 기록(모든 매장)의 요약(내용 json 은 빼고) */
function recsLight_(br, uid) {
  var seen = {}, out = [];
  ST.part('records', { br: br, light: 1 }).concat(ST.part('records', { uid: uid, light: 1 })).forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; out.push(x.a); } });
  return out;
}
''')
sub("var recs = rows_('records'), mine = {}", "var recs = recsLight_(br, u.uid), mine = {}")
sub("rr = rows_('records'), list = [];", "rr = ST.part('records', { cid: c.id, br: br }).map(function (x) { return x.a; }), list = [];")
sub("rewrite_('records', function (r) { return String(r[0]) !== c.id; });", "ST.partDel('records', { cid: c.id });")
sub("rows_('records').some(function (r) {", "ST.part('records', { uid: p.uid, light: 1 }).map(function (x) { return x.a; }).some(function (r) {")
sub("cnt = {}, rr = rows_('records'), pend = {}", "cnt = {}, pend = {}")
sub("for (var i = 0; i < rr.length; i++) if (num_(rr[i][2]) > 0) { var k = str_(rr[i][1]); cnt[k] = (cnt[k] || 0) + 1; }",
    "ST.part('records', { cnt: 1 }).forEach(function (x) { cnt[str_(x.a[0])] = num_(x.a[1]); });")
sub("rewrite_('records', function (r) { return str_(r[1]) !== k; });", "ST.partDel('records', { uid: k });")

# 5) 그림(images)
sub("var parts = rows_('images').filter(function (r) { return str_(r[0]) === id; })", "var parts = ST.part('images', { id: id }).map(function (x) { return x.a; })")
sub("rewrite_('images', function (r) { return used[str_(r[0])] || num_(r[3]) > cut; });",
    "var gone = {}; ST.part('images', { light: 1 }).forEach(function (x) { var id = str_(x.a[0]); if (!used[id] && num_(x.a[3]) <= cut && !gone[id]) { gone[id] = 1; ST.partDel('images', { id: id }); } });")
sub("rewrite_('images', function (r) { return str_(r[0]) !== id; }); cache_().remove('img:' + id);", "ST.partDel('images', { id: id });")

# 6) 활동 기록(log): 최근 것만
sub("var r = rows_('log'), out = [];", "var r = ST.part('log', { recent: 800 }).map(function (x) { return x.a; }), out = [];")

# 7) 처음 설정·관리: 수파베이스용
cut('/* ───────────── 처음 설정·옮기기·관리 ───────────── */', None, r'''/* ───────────── 처음 설정·관리 (수파베이스) ─────────────
 * 구글 시트에서 옮겨 온 경우에는 setup 이 필요 없어요(이미 준비된 자료). 빈 데이터베이스로 시작할 때만 씁니다. */
function setup() {
  var props = PropertiesService.getScriptProperties(), msg = '';
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', rand_(40));
  if (!rows_('branches').length) {
    SEED_BRANCHES.forEach(function (b, i) { append_('branches', [b[0], b[1], 1, i + 1, Date.now()]); });
    msg += '매장 ' + SEED_BRANCHES.length + '곳을 만들었어요: ' + branches_().map(function (b) { return b.name; }).join(', ') + '\n';
  }
  seedFaq_();
  msg += seedPromo_();
  var adm = findUser_(ADMIN_NICK);
  if (!adm) {
    var pin = genPin_(6), salt = rand_(16);
    var u = { nick: ADMIN_NICK, kind: 'admin', start: '', end: '', hash: '', salt: salt, must: 1, active: 1, fail: 0, lock: 0, created: Date.now(), last: 0, ext: 0, seen: 0, uid: newUid_(), home: BRANCH, homeAt: 0, nickAt: 0, prev: '', prevUntil: 0, lastBr: BRANCH, lockN: 0, plen: 6 };
    u.hash = hashPin_(pin, salt);
    append_('users', userRow_(u));
    msg += '관리자 계정을 만들었어요.\n닉네임: ' + ADMIN_NICK + '\n처음 비밀번호: ' + pin + '\n(처음 들어가면 바로 나만의 비밀번호 6자리로 바꾸게 돼요. 이 번호는 다시 볼 수 없어요.)';
  } else if (adm.kind !== 'admin') { adm.kind = 'admin'; adm.start = ''; adm.end = ''; adm.active = 1; saveUser_(adm); msg += '"' + ADMIN_NICK + '" 계정을 관리자로 바꿨어요.\n'; }
  else msg += '이미 준비되어 있어요.';
  return msg;
}
function tryUi_(title, msg) { console.log(title + ': ' + msg); }

/** 관리자 비밀번호를 잊었을 때 새로 만듭니다(6자리). 수파베이스 SQL 편집기에서: select lz_reset_admin(); 로도 할 수 있어요. */
function devResetAdminPin() {
  var u = findUser_(ADMIN_NICK) || users_().filter(function (x) { return x.kind === 'admin'; })[0];
  if (!u) return '관리자 계정이 없어요.';
  var pin = genPin_(6);
  u.salt = rand_(16); u.hash = hashPin_(pin, u.salt); u.must = 1; u.fail = 0; u.lock = 0; u.lockN = 0; u.active = 1; u.kind = 'admin'; u.plen = 6;
  saveUser_(u); dropSessions_(u.uid);
  return u.nick + ' 의 새 비밀번호: ' + pin;
}

/** 매일 새벽(수파베이스 예약 작업이 부름): 만료·오래 안 쓴 로그인 정리, 문의 정리, 안 쓰는 그림, 1년 지난 입금자 이름 가림, 이력은 최근 3,000줄 */
function dailyMaintenance() { dailyMaintenance_(); }
function dailyMaintenance_() {
  purgeSessions_();
  try { dropOrphanImgs_(); } catch (e) { console.error(e); }
  try { qnaMaintenance_(); } catch (e) { console.error(e); }
  try { maskOldDepositors_(); } catch (e) { console.error(e); }
  ST.partTrim('log', LIM.logRows);
}
/** 개인정보: 처리한 지 1년이 지난 결제의 입금자 이름을 가림 */
function maskOldDepositors_() {
  var r = rows_('payments'), cut = Date.now() - 365 * 86400000;
  for (var i = 0; i < r.length; i++) if (num_(r[i][8]) && num_(r[i][8]) < cut && str_(r[i][5]) && str_(r[i][5]) !== '*') setCell_('payments', i + 2, 6, '*');
}
''')

# 남은 시트 전용 코드가 없는지 확인
for bad in ['sheet_(', 'getRange', 'SpreadsheetApp.getActive', 'DriveApp', 'ScriptApp', "rows_('records')", "rows_('images')", "rows_('log')", "rewrite_('records'", "rewrite_('images'"]:
    if bad in src:
        i = src.find(bad)
        sys.exit('아직 시트 전용 코드가 남았어요: %s … %r' % (bad, src[max(0, i - 80):i + 60]))

head = '''// ★ 자동으로 만든 파일이에요. 고치려면 apps-script/Code.gs 를 고치고 python3 tools/build-edge.py 를 실행하세요.
// 파크골프 공략노트 — 서버 로직(수파베이스용). 업무 규칙은 Code.gs 와 같고, 저장만 엔진(ST)이 맡습니다.
export function makeCore(G) {
  var Date = G.Date, console = G.console, ST = G.ST, Utilities = G.Utilities, CacheService = G.CacheService, LockService = G.LockService,
    PropertiesService = G.PropertiesService, ContentService = G.ContentService, SpreadsheetApp = G.SpreadsheetApp, Session = G.Session;
'''
tail = '''
  return {
    H: H, SH: SH, VER: VER, APP: APP, doPost: doPost, setup: setup, dailyMaintenance: dailyMaintenance, devResetAdminPin: devResetAdminPin,
    fn: { setSetting_: setSetting_, saveUser_: saveUser_, findUser_: findUser_, users_: users_, hashPin_: hashPin_, sha_: sha_, addDays_: addDays_, today_: today_,
      dropSessions_: dropSessions_, userByUid_: userByUid_, settings_: settings_, rows_: rows_, setCell_: setCell_, append_: append_, genPin_: genPin_ }
  };
}
'''
body = '\n'.join(('  ' + l if l.strip() else '') for l in src.split('\n'))
out = head + body + tail
open(os.path.join(ROOT, 'supabase', 'functions', 'api', 'core.js'), 'w', encoding='utf-8').write(out)

# 붙여넣기용 한 파일: core.js + engine.js + index.ts
fn = os.path.join(ROOT, 'supabase', 'functions', 'api')
eng = open(os.path.join(fn, 'engine.js'), encoding='utf-8').read()
idx = open(os.path.join(fn, 'index.ts'), encoding='utf-8').read()
idx = re.sub(r"^import \{[^}]*\} from '\./(core|engine)\.js';\n", '', idx, flags=re.M)
eng = re.sub(r"^import \{[^}]*\} from 'node:crypto';\n", '', eng, flags=re.M)
one = ('// @ts-nocheck\n// ★ 수파베이스 화면(Edge Functions → api → Code)에 이 파일 내용을 통째로 붙여 넣고 Deploy 하세요.\n'
       "import { createHash, randomUUID } from 'node:crypto';\n" +
       re.sub(r'^export ', '', out, flags=re.M) + '\n' + re.sub(r'^export ', '', eng, flags=re.M) + '\n' + idx.replace('// @ts-nocheck\n', ''))
os.makedirs(os.path.join(ROOT, 'supabase', '붙여넣기'), exist_ok=True)
open(os.path.join(ROOT, 'supabase', '붙여넣기', 'index.ts'), 'w', encoding='utf-8').write(one)
print('만들었어요: core.js (%d줄), 붙여넣기/index.ts (%dKB)' % (out.count('\n'), len(one.encode()) // 1024))
