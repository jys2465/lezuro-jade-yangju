// 구글 앱스크립트·구글 시트 모의 환경 (시험용). 실제 시트의 까다로운 동작을 일부러 흉내 냅니다:
//  - 서식이 '@'(일반 텍스트)가 아닌 칸에 "1004" 를 쓰면 숫자로, "2026-10-20" 을 쓰면 날짜로 바뀜
//  - "="로 시작하는 글자는 수식으로 취급(읽으면 오류 값)
//  - 칸 하나에 50,000자를 넘기면 오류
//  - computeDigest 는 -128~127 사이의 부호 있는 바이트 배열을 돌려줌
const vm = require('vm'), fs = require('fs'), crypto = require('crypto'), path = require('path');
const KST = 9 * 3600e3;
function a1(ref) { const m = ref.match(/^([A-Z]+)(\d+)$/); return [+m[2], m[1].split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)]; }

class Range {
  constructor(sh, r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) throw new Error(`The coordinates or dimensions of the range are invalid. (${sh.name} r${r} c${c} ${nr}x${nc}; grid ${sh.maxRows}x${sh.maxCols})`);
    Object.assign(this, { sh, r, c, nr, nc });
  }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j)); o.push(row); } return o; }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`Number of rows/columns mismatch: ${v.length}x${v[0] && v[0].length} vs ${this.nr}x${this.nc}`);
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._set(this.r + i, this.c + j, v[i][j]);
    return this;
  }
  setValue(x) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._set(this.r + i, this.c + j, x); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) delete this.sh.cells[(this.r + i) + ',' + (this.c + j)]; return this; }
  setNumberFormat(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt[(this.r + i) + ',' + (this.c + j)] = f; return this; }
}
class Sheet {
  constructor(ss, name) { Object.assign(this, { ss, name, cells: {}, fmt: {}, maxRows: 1000, maxCols: 26, hidden: false, frozen: 0 }); }
  getName() { return this.name; } setName(n) { this.name = n; return this; }
  getMaxRows() { return this.maxRows; } getMaxColumns() { return this.maxCols; }
  getRange(a, b, c, d) { if (typeof a === 'string') { const [r, cc] = a1(a); return new Range(this, r, cc, 1, 1); } return new Range(this, a, b, c || 1, d || 1); }
  getLastRow() { let m = 0; for (const k in this.cells) { const v = this.cells[k]; if (v !== '' && v !== null && v !== undefined) m = Math.max(m, +k.split(',')[0]); } return m; }
  insertRowsAfter(pos, n) { if (n < 1) throw new Error('bad n'); this.maxRows += n; }
  insertColumnsAfter(pos, n) { this.maxCols += n; }
  deleteRows(start, n) {
    const out = {}, fm = {};
    for (const k in this.cells) { const [r, c] = k.split(',').map(Number); if (r >= start && r < start + n) continue; out[(r >= start + n ? r - n : r) + ',' + c] = this.cells[k]; }
    for (const k in this.fmt) { const [r, c] = k.split(',').map(Number); if (r >= start && r < start + n) continue; fm[(r >= start + n ? r - n : r) + ',' + c] = this.fmt[k]; }
    this.cells = out; this.fmt = fm; this.maxRows = Math.max(this.maxRows - n, 2);
  }
  setFrozenRows(n) { this.frozen = n; } hideSheet() { this.hidden = true; return this; }
  copyTo(ss) { const sh = new Sheet(ss, this.name + '의 사본'); sh.cells = JSON.parse(JSON.stringify(this.cells)); sh.maxRows = this.maxRows; ss.sheets.push(sh); return sh; }
  _get(r, c) {
    const v = this.cells[r + ',' + c];
    if (v === undefined) return '';
    if (v && v.__formula) return '#NAME?';
    if (v && v.__date) return new Date(v.__date);   // 날짜로 변환된 칸은 Date 로 읽힘
    return v;
  }
  _set(r, c, v) {
    if (typeof v === 'string' && v.length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
    if (v === undefined || v === null) v = '';
    const f = this.fmt[r + ',' + c];
    if (f === '@') { this.cells[r + ',' + c] = v === '' ? '' : String(v); return; }   // 일반 텍스트: 항상 글자로 저장
    if (typeof v === 'string') {
      if (/^=/.test(v)) { this.cells[r + ',' + c] = { __formula: v }; return; }
      if (/^-?\d+(\.\d+)?$/.test(v)) { this.cells[r + ',' + c] = Number(v); return; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { this.cells[r + ',' + c] = { __date: Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) - KST }; return; }
    }
    this.cells[r + ',' + c] = v;
  }
}
class Spreadsheet {
  constructor() { this.sheets = []; this.tz = 'Asia/Seoul'; }
  getId() { return 'ss1'; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error('sheet exists ' + n); const s = new Sheet(this, n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  getSheets() { return this.sheets.slice(); }
  getSpreadsheetTimeZone() { return this.tz; }
}
function fmtDate(d, tz, fmt) {
  const t = new Date(d.getTime() + KST), p = (n, w = 2) => String(n).padStart(w, '0');
  const Y = t.getUTCFullYear(), M = t.getUTCMonth() + 1, D = t.getUTCDate();
  return fmt.replace('yyyy', Y).replace('yy', p(Y % 100)).replace('MM', p(M)).replace('dd', p(D)).replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes())).replace('ss', p(t.getUTCSeconds()));
}
function createEnv(opts) {
  const ss = new Spreadsheet(), props = {}, cache = {}, triggers = [], logs = [];
  const state = { now: Date.now(), lockBusy: false, sheetLock: 0 };
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) },
    Math, JSON, Object, Array, String, Number, isFinite, RegExp, Error, parseInt, parseFloat, Date: class extends Date {
      constructor(...a) { if (a.length === 0) super(state.now); else super(...a); }
      static now() { return state.now; }
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => { throw new Error('no ui'); }, flush: () => { state.flushes = (state.flushes || 0) + 1; } },
    LockService: { getScriptLock: () => ({ tryLock: () => !state.lockBusy, releaseLock: () => { state.sheetLock++; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache[k]; return e && e.exp > state.now ? e.v : null; },
      put: (k, v, sec) => { if (String(v).length > 100000) throw new Error('Argument too large'); cache[k] = { v: String(v), exp: state.now + (sec || 600) * 1000 }; },
      remove: k => { delete cache[k]; },
      getAll: ks => { const o = {}; ks.forEach(k => { const e = cache[k]; if (e && e.exp > state.now) o[k] = e.v; }); return o; },
      putAll: (o, sec) => { Object.keys(o).forEach(k => { if (String(o[k]).length > 100000) throw new Error('Argument too large'); cache[k] = { v: String(o[k]), exp: state.now + (sec || 600) * 1000 }; }); } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), formatDate: fmtDate, sleep: () => {},
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (algo, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)) // 부호 있는 바이트
    },
    ContentService: { createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }), MimeType: { JSON: 'JSON' } },
    ScriptApp: { WeekDay: { SUNDAY: 'SUNDAY' }, getProjectTriggers: () => triggers.slice(), newTrigger: fn => { const ch = { timeBased: () => ch, everyDays: () => ch, onWeekDay: () => ch, atHour: () => ch, create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } }; return ch; } },
    DriveApp: (() => { const files = [], folders = [];
      const mkFolder = n => { const f = { name: n, getFiles: () => { const l = files.filter(x => x.folder === f && !x.trashed); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; } }; folders.push(f); return f; };
      return { _files: files, getFoldersByName: n => { const l = folders.filter(f => f.name === n); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; }, createFolder: mkFolder,
        getFileById: () => ({ makeCopy: (n, folder) => { const f = { n, folder, trashed: false, getName: () => n, setTrashed: v => { f.trashed = v; } }; files.push(f); return f; } }) }; })(),
    Session: { getScriptTimeZone: () => 'Asia/Seoul' }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  if (opts && opts.vars) vm.runInContext(Object.keys(opts.vars).map(k => k + ' = ' + JSON.stringify(opts.vars[k]) + ';').join(''), ctx);   // 매장 코드 등 바꿔 시험
  const call = (payload, t) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(t === undefined ? payload : Object.assign({ t }, payload)) } }).getContent());
  return { ss, props, ctx, state, call, logs, triggers, cache, doGet: () => JSON.parse(ctx.doGet().getContent()) };
}
module.exports = { createEnv, fmtDate };
