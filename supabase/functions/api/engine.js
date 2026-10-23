// 파크골프 공략노트 — 수파베이스 엔진
// 서버 로직(core.js, Code.gs 와 같은 규칙)이 예전 구글 시트처럼 "표를 통째로 읽고 줄 번호로 쓰는" 방식 그대로 돌게 해 줍니다.
//
//  - 모든 자료는 lz 표 한 곳에(tab = 예전 시트 이름, d = 한 줄의 칸들). 바뀔 때마다 v(순번)가 올라가요.
//  - 작은 표(회원·설정·로그인…)는 서버 메모리에 기억해 두고, 다음 요청 때는 "바뀐 줄만" 받아 옵니다(빠르고 데이터 사용이 적음).
//  - 큰 표(기록·그림·이력·로고)는 필요한 부분만 그때그때 읽어요.
//  - 로직이 아직 안 읽은 표·캐시를 찾으면, 그것까지 읽어 와서 처음부터 다시 돌립니다(쓰기는 모두 끝난 뒤 한 번에 저장).
//  - 저장하는 요청은 데이터베이스 잠금으로 한 번에 하나씩(예전 앱스크립트 잠금과 같음) → 두 번 승인 같은 꼬임이 없어요.
import { createHash, randomUUID } from 'node:crypto';

export const BIG = {
  records: { w: 6, cols: { cid: 0, uid: 1, br: 5 }, light: 3 },
  images: { w: 4, cols: { id: 0 }, light: 2 },
  log: { w: 4, cols: {} },
  logos: { w: 2, cols: {} }
};
const NOCACHE = /^(cfg$|branches$|courses$|s:|img:)/;   // 표를 메모리에 두니까 따로 캐시할 필요 없는 것
const BASE = ['users', 'settings', 'branches', 'sessions'];
const LOCK_ID = 7001;
const KST = 9 * 3600000;

function cell(v) { return v === undefined || v === null ? '' : String(v); }
function norm(row, w) {
  const a = [];
  for (let i = 0; i < Math.max(w, row.length); i++) {
    const v = cell(row[i]);
    if (v.length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
    a.push(v);
  }
  return a;
}
function pad(d, w) { const a = Array.isArray(d) ? d.map(cell) : []; while (a.length < w) a.push(''); return a; }
function J(x) { return JSON.stringify(x); }

/** 날짜 글자: yyyy yy MM M dd d HH H mm ss (서울 시간) */
export function formatDate(d, tz, fmt) {
  const t = new Date(d.getTime() + KST), p = n => String(n).padStart(2, '0');
  const v = { yyyy: t.getUTCFullYear(), yy: p(t.getUTCFullYear() % 100), MM: p(t.getUTCMonth() + 1), M: t.getUTCMonth() + 1, dd: p(t.getUTCDate()), d: t.getUTCDate(),
    HH: p(t.getUTCHours()), H: t.getUTCHours(), mm: p(t.getUTCMinutes()), ss: p(t.getUTCSeconds()) };
  return fmt.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm|ss/g, k => String(v[k]));
}

/**
 * opt.db = { q(sql, params) → rows, tx(fn(q)) }   opt.makeCore = core.js 의 makeCore
 * opt.Date = (시험용) 시간을 바꿀 수 있는 Date
 */
export function createEngine(opt) {
  const db = opt.db, DateC = opt.Date || Date, log = opt.console || console;
  const now = () => DateC.now();
  const inst = { tabs: {}, vs: {}, Wt: {}, dead: {}, act: {}, props: null, propsAt: 0 };   // 서버 메모리: 표별 줄(id → 칸들)·순번·어디까지 받았는지, 요청별로 쓰던 표
  let cur = null;                              // 지금 돌고 있는 요청의 상태

  const ST = {
    rows: n => cur.rows(n), append: (n, r) => cur.append(n, r), setRow: (n, r, row) => cur.setRow(n, r, row), setCell: (n, r, c, v) => cur.setCell(n, r, c, v),
    rewrite: (n, k) => cur.rewrite(n, k), part: (t, f) => cur.part(t, f), partPut: (t, id, row) => cur.partPut(t, id, row), partDel: (t, f) => cur.partDel(t, f),
    partTrim: (t, n) => cur.partTrim(t, n)
  };
  const cacheApi = {
    get: k => cur.kvGet(k), put: (k, v, s) => cur.kvPut(k, v, s), remove: k => cur.kvDel(k),
    getAll: ks => { const o = {}; ks.forEach(k => { const v = cur.kvGet(k); if (v !== null) o[k] = v; }); return o; },
    putAll: (o, s) => { Object.keys(o).forEach(k => cur.kvPut(k, o[k], s)); }
  };
  const propApi = { getProperty: k => cur.propGet(k), setProperty: (k, v) => cur.propSet(k, v) };
  const G = {
    Date: DateC, console: log, ST,
    Utilities: {
      formatDate, getUuid: () => randomUUID(), DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (a, s) => Array.from(createHash('sha256').update(String(s), 'utf8').digest())
    },
    CacheService: { getScriptCache: () => cacheApi },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },   // 잠금은 엔진이 데이터베이스에서
    PropertiesService: { getScriptProperties: () => propApi },
    ContentService: { createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }), MimeType: { JSON: 'JSON' } },
    SpreadsheetApp: { flush: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' }
  };
  const core = opt.makeCore(G);
  const SH = core.SH;
  const width = n => (SH[n] ? SH[n].length : BIG[n] ? BIG[n].w : 2);

  /* ───── 한 번 돌릴 때의 상태 ───── */
  class State {
    constructor(R) {
      this.R = R; this.t = {}; this.need = { tabs: new Set(), keys: new Set(), parts: new Map() };
      this.kvw = new Map(); this.propw = new Map(); this.pops = []; this.used = new Set(); this.tmp = 0;
    }
    tab(n) {
      if (BIG[n]) throw new Error('큰 표는 rows_ 로 읽지 않아요: ' + n);
      if (!SH[n]) throw new Error('없는 표: ' + n);
      this.used.add(n);
      let T = this.t[n];
      if (T) return T;
      const src = inst.tabs[n];
      if (!src) { this.need.tabs.add(n); return null; }
      const w = width(n);
      T = this.t[n] = { rows: [], del: [] };
      for (const [id, d] of src) T.rows.push({ id, a: pad(d, w), o: d });
      return T;
    }
    rows(n) { const T = this.tab(n); return T ? T.rows.map(x => x.a.slice()) : []; }
    append(n, row) {
      if (BIG[n]) { this.partPut(n, 0, row); return 0; }
      const T = this.tab(n); if (!T) return 0;
      T.rows.push({ id: 0, a: norm(row, width(n)), o: null });
      return T.rows.length + 1;
    }
    at(n, r) { const T = this.tab(n); if (!T) return null; const x = T.rows[r - 2]; if (!x) throw new Error('없는 줄이에요: ' + n + ' ' + r); return x; }
    setRow(n, r, row) { const x = this.at(n, r); if (x) x.a = norm(row, width(n)); }
    setCell(n, r, c, v) { const x = this.at(n, r); if (!x) return; v = cell(v); if (v.length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.'); while (x.a.length < c) x.a.push(''); x.a[c - 1] = v; }
    rewrite(n, keep) {
      if (BIG[n]) throw new Error('큰 표는 rewrite_ 를 쓰지 않아요: ' + n);
      const T = this.tab(n); if (!T) return 0;
      const out = [];
      for (const x of T.rows) { if (keep(x.a.slice())) out.push(x); else if (x.id) T.del.push(x.id); }
      const k = T.rows.length - out.length; T.rows = out; return k;
    }
    /* 큰 표: 조건에 맞는 줄만 { id, a } */
    part(tab, f) {
      const key = tab + J(f), base = this.R.parts.get(key);
      if (!base) { this.need.parts.set(key, { tab, f }); return []; }
      let list = base.map(x => ({ id: x.id, a: x.a.slice() }));
      if (!f.cnt) for (const op of this.pops) {
        if (op.tab !== tab) continue;
        if (op.k === 'del') list = list.filter(x => !match(tab, op.f, x.a));
        else if (op.k === 'put') {
          const y = op.id ? list.find(x => x.id === op.id) : null;
          if (y) y.a = lightOf(tab, f, op.a);
          else if (!op.id && match(tab, f, op.a)) list.push({ id: op.tid, a: lightOf(tab, f, op.a) });
        }
      }
      return list.map(x => ({ id: x.id, a: x.a.slice() }));
    }
    partPut(tab, id, row) { this.pops.push({ k: 'put', tab, id: id > 0 ? id : 0, tid: id > 0 ? id : -(++this.tmp), a: norm(row, width(tab)) }); }
    partDel(tab, f) { this.pops.push({ k: 'del', tab, f }); }
    partTrim(tab, n) { this.pops.push({ k: 'trim', tab, n }); }
    kvGet(k) {
      k = String(k);
      if (NOCACHE.test(k)) return null;
      if (this.kvw.has(k)) { const e = this.kvw.get(k); return e && e.exp > now() ? e.v : null; }
      if (this.R.kv.has(k)) return this.R.kv.get(k);
      this.need.keys.add(k); return null;
    }
    kvPut(k, v, sec) {
      k = String(k); v = String(v);
      if (NOCACHE.test(k)) return;
      if (v.length > 100000) throw new Error('Argument too large: value');
      this.kvw.set(k, { v, exp: now() + Math.min(sec || 600, 21600) * 1000 });
    }
    kvDel(k) { k = String(k); if (!NOCACHE.test(k)) this.kvw.set(k, null); }
    propGet(k) { if (this.propw.has(k)) return this.propw.get(k); const v = this.R.props[k]; return v === undefined ? null : v; }
    propSet(k, v) { this.propw.set(k, String(v)); }
    needs() { return this.need.tabs.size + this.need.keys.size + this.need.parts.size; }
  }
  function match(tab, f, a) {
    const cols = BIG[tab].cols;
    for (const k in f) {
      if (k in cols) { if (String(a[cols[k]]) !== String(f[k])) return false; }
      else if (k === 'pre') { if (String(a[0]).indexOf(f.pre) !== 0) return false; }
    }
    return true;
  }
  function lightOf(tab, f, a) { a = a.slice(); if (f.light && BIG[tab].light !== undefined) a[BIG[tab].light] = ''; return a; }

  /* ───── 읽기 ─────
   * 표마다 "어디까지 받았는지(Wt)"와 줄마다 순번(v)을 기억해서, 요청 여러 개가 동시에 받아 와도 옛 자료가 새 자료를 덮지 않아요. */
  function dropTab(t) { delete inst.tabs[t]; delete inst.vs[t]; delete inst.Wt[t]; delete inst.dead[t]; }
  function putRow(t, id, v, d) {
    const m = inst.tabs[t], vs = inst.vs[t];
    if (!m || inst.dead[t].has(id)) return false;
    const ov = vs.get(id);
    if (ov !== undefined && ov >= v) return false;
    const isNew = ov === undefined;
    m.set(id, d); vs.set(id, v);
    return isNew;
  }
  function resort(t) { const m = inst.tabs[t]; inst.tabs[t] = new Map([...m.entries()].sort((a, b) => a[0] - b[0])); }
  async function syncTabs(q, want) {
    const loaded = Object.keys(inst.tabs), fresh = [...want].filter(t => !inst.tabs[t] && SH[t] && !BIG[t]);
    if (!loaded.length && !fresh.length) return;
    const floor = loaded.length ? Math.min(...loaded.map(t => inst.Wt[t] || 0)) : 0;
    const rows = await q(
      `select 0 as k, id::float8 as id, v::float8 as v, tab, d from lz where v > $1::bigint and tab in (select jsonb_array_elements_text($2::text::jsonb))
       union all select 1, id::float8, v::float8, tab, d from lz where tab in (select jsonb_array_elements_text($3::text::jsonb))
       union all select 2, id::float8, v::float8, tab, null from lz_gone where v > $1::bigint and tab in (select jsonb_array_elements_text($2::text::jsonb))
       union all select 3, greatest((select coalesce(max(v), 0) from lz), (select coalesce(max(v), 0) from lz_gone), p.x)::float8, p.x::float8, null, null
         from (select coalesce((select v::bigint from lz_prop where k = 'purged'), 0) as x) p`,
      [floor, J(loaded), J(fresh)]);
    let W = 0, purged = 0;
    const full = {}, delta = [], gone = [];
    for (const r of rows) {
      const k = Number(r.k);
      if (k === 3) { W = Number(r.id); purged = Number(r.v); }
      else if (k === 1) (full[r.tab] = full[r.tab] || []).push(r);
      else if (k === 0) delta.push(r);
      else gone.push(r);
    }
    const stale = loaded.filter(t => inst.tabs[t] && purged > (inst.Wt[t] || 0));
    if (stale.length) {                                           // 오래 쉬는 동안 "지운 줄 기록"이 정리됨 → 그 표는 새로 받음
      stale.forEach(dropTab); inst.props = null;
      return syncTabs(q, new Set([...want, ...stale]));
    }
    const touched = new Set();
    for (const t of fresh) {
      const list = (full[t] || []).sort((a, b) => a.id - b.id);
      if (!inst.tabs[t]) {
        inst.tabs[t] = new Map(list.map(r => [Number(r.id), r.d]));
        inst.vs[t] = new Map(list.map(r => [Number(r.id), Number(r.v)]));
        inst.dead[t] = new Set(); inst.Wt[t] = W;
      } else { for (const r of list) if (putRow(t, Number(r.id), Number(r.v), r.d)) touched.add(t); inst.Wt[t] = Math.max(inst.Wt[t] || 0, W); }
    }
    delta.sort((a, b) => a.id - b.id);
    for (const r of delta) if (putRow(r.tab, Number(r.id), Number(r.v), r.d)) touched.add(r.tab);
    for (const r of gone) { const t = r.tab, id = Number(r.id); if (!inst.tabs[t]) continue; inst.tabs[t].delete(id); inst.vs[t].delete(id); inst.dead[t].add(id); }
    for (const t of loaded) if (inst.tabs[t]) inst.Wt[t] = Math.max(inst.Wt[t] || 0, W);
    for (const t of touched) {                                    // 새 줄이 순서와 다르게 들어왔으면 다시 줄 세움
      let prev = -1, ok = true; for (const id of inst.tabs[t].keys()) { if (id < prev) { ok = false; break; } prev = id; }
      if (!ok) resort(t);
    }
  }
  async function fetchPart(q, p) {
    const B = BIG[p.tab], f = p.f, args = [p.tab], where = ['tab = $1'];
    if (f.cnt) {                                                 // 회원별 기록 수(채운 코스)
      const rows = await q(`select d->>1 as u, count(*)::float8 as n from lz where tab = $1 and (case when d->>2 ~ '^[0-9]+(\.[0-9]+)?$' then (d->>2)::numeric else 0 end) > 0 group by d->>1`, [p.tab]);
      return rows.map(r => ({ id: 0, a: [r.u, String(r.n)] }));
    }
    for (const k in f) {
      if (k in B.cols) { args.push(String(f[k])); where.push(`d->>${B.cols[k]} = $${args.length}`); }
      else if (k === 'pre') { args.push(String(f.pre)); where.push(`left(d->>0, length($${args.length})) = $${args.length}`); }
    }
    const sel = f.light && B.light !== undefined ? `jsonb_set(d, '{${B.light}}', '""')` : 'd';
    let sql = `select id::float8 as id, ${sel} as d from lz where ${where.join(' and ')} order by id`;
    if (f.recent) sql = `select * from (select id::float8 as id, ${sel} as d from lz where ${where.join(' and ')} order by id desc limit ${Math.min(5000, +f.recent | 0)}) x order by id`;
    const rows = await q(sql, args);
    return rows.map(r => ({ id: Number(r.id), a: pad(r.d, B.w) }));
  }
  async function fetchPass(q, R, need, first) {
    const jobs = [];
    if (first || [...need.tabs].some(t => !inst.tabs[t] && SH[t] && !BIG[t])) jobs.push(syncTabs(q, need.tabs));
    const ks = [...need.keys].filter(k => !R.kv.has(k));
    if (ks.length) jobs.push(q(`select k, v from lz_kv where k in (select jsonb_array_elements_text($1::text::jsonb)) and exp > $2::bigint`, [J(ks), now()])
      .then(rows => { ks.forEach(k => R.kv.set(k, null)); rows.forEach(r => R.kv.set(r.k, r.v)); }));
    for (const [key, p] of need.parts) if (!R.parts.has(key)) jobs.push(fetchPart(q, p).then(rows => R.parts.set(key, rows)));
    if (first) {                                                 // 비밀 값은 거의 안 바뀌어서 1분 동안 기억
      if (inst.props && now() - inst.propsAt < 60000) R.props = inst.props;
      else jobs.push(q(`select k, v from lz_prop`, []).then(rows => { R.props = {}; rows.forEach(r => { R.props[r.k] = r.v; }); inst.props = R.props; inst.propsAt = now(); }));
    }
    await Promise.all(jobs);
  }

  /* ───── 저장 ───── */
  function plan(st, noSeat) {
    const lz = [], kv = [];
    for (const n in st.t) {
      const T = st.t[n];
      if (T.del.length) lz.push([`delete from lz where id in (select (jsonb_array_elements_text($1::text::jsonb))::bigint)`, [J(T.del)]]);
      for (const x of T.rows) {
        if (!x.id) continue;
        const o = pad(x.o, x.a.length), ch = [];
        for (let i = 0; i < x.a.length; i++) if (x.a[i] !== o[i]) ch.push(i);
        if (!ch.length) continue;
        let e = `lz_pad(d, ${x.a.length})`; const args = [x.id];
        for (const i of ch) { args.push(x.a[i]); e = `jsonb_set(${e}, '{${i}}', to_jsonb($${args.length}::text))`; }
        lz.push([`update lz set d = ${e} where id = $1`, args]);
      }
      const ins = T.rows.filter(x => !x.id).map(x => x.a);
      if (ins.length) lz.push([`insert into lz (tab, d) select $1, x from jsonb_array_elements($2::text::jsonb) with ordinality as t(x, o) order by o`, [n, J(ins)]]);
    }
    for (const op of st.pops) {
      const B = BIG[op.tab];
      if (op.k === 'put') {
        if (op.id) lz.push([`update lz set d = $2::text::jsonb where id = $1 and tab = $3`, [op.id, J(op.a), op.tab]]);
        else lz.push([`insert into lz (tab, d) values ($1, $2::text::jsonb)`, [op.tab, J(op.a)]]);
      } else if (op.k === 'del') {
        const args = [op.tab], where = ['tab = $1'];
        for (const k in op.f) {
          if (k in B.cols) { args.push(String(op.f[k])); where.push(`d->>${B.cols[k]} = $${args.length}`); }
          else if (k === 'pre') { args.push(String(op.f.pre)); where.push(`left(d->>0, length($${args.length})) = $${args.length}`); }
        }
        if (where.length > 1) lz.push([`delete from lz where ${where.join(' and ')}`, args]);
      } else if (op.k === 'trim') {
        lz.push([`delete from lz where tab = $1 and id < (select id from lz where tab = $1 order by id desc offset $2 limit 1)`, [op.tab, Math.max(1, op.n | 0) - 1]]);
      }
    }
    const put = [], del = [];
    for (const [k, e] of st.kvw) { if (noSeat && (k === 'seats' || k === 'queue')) continue; if (e) put.push([k, e.v, e.exp]); else del.push(k); }
    if (put.length) kv.push([`insert into lz_kv (k, v, exp) select x->>0, x->>1, (x->>2)::bigint from jsonb_array_elements($1::text::jsonb) x
      on conflict (k) do update set v = excluded.v, exp = excluded.exp`, [J(put)]]);
    if (del.length) kv.push([`delete from lz_kv where k in (select jsonb_array_elements_text($1::text::jsonb))`, [J(del)]]);
    if (st.propw.size) inst.props = null;
    if (st.propw.size) kv.push([`insert into lz_prop (k, v) select x->>0, x->>1 from jsonb_array_elements($1::text::jsonb) x on conflict (k) do update set v = excluded.v`, [J([...st.propw])]]);
    return { lz, kv };
  }
  async function runAll(q, stmts) { for (const [s, a] of stmts) await q(s, a); }
  async function lockIn(q, sec) {
    await q(`set local lock_timeout = '${sec || 15}s'`, []);
    await q(`select pg_advisory_xact_lock(${LOCK_ID})`, []);
  }

  /* ───── 한 요청 처리 ───── */
  function preNeed(qq) {
    const need = { tabs: new Set(BASE.concat(inst.act[qq.a] || [])), keys: new Set(['seats', 'queue']), parts: new Map() };
    if (qq.t) {
      const th = createHash('sha256').update(String(qq.t), 'utf8').digest('hex');
      ['sa:', 'sw:'].forEach(p => need.keys.add(p + th));
      const ss = inst.tabs.sessions;
      if (ss) for (const d of ss.values()) if (d[0] === th) { need.keys.add('seen:' + d[1]); need.keys.add('away:' + d[1]); break; }
    }
    return need;
  }
  async function exec(q, need, fn, locked) {
    const R = { parts: new Map(), kv: new Map(), props: {} };
    for (let pass = 0; pass < 12; pass++) {
      await fetchPass(q, R, need, pass === 0);
      const st = new State(R);
      cur = st;
      let out, err = null;
      try { out = fn(); } catch (e) { err = e; } finally { cur = null; }
      if (err && !st.needs()) throw err;                         // 다 읽은 상태에서 난 오류만 진짜 오류
      if (st.needs()) {                                           // 아직 안 읽은 것이 있었음 → 읽고 다시
        need = { tabs: new Set([...need.tabs, ...st.need.tabs]), keys: new Set([...need.keys, ...st.need.keys]), parts: new Map([...need.parts, ...st.need.parts]) };
        continue;
      }
      const p = plan(st);
      if (!locked && (p.lz.length || st.kvw.has('seats') || st.kvw.has('queue'))) {
        /* 읽기 요청인데 저장할 것이 생김(마지막 사용 시각·좌석 등) → 잠금을 잡고 최신 자료로 처음부터 다시.
           잠금을 3초 안에 못 잡으면 이번에는 가벼운 기록만 남기고 답함(다음 요청 때 다시 저장돼요) */
        try { return await db.tx(async tq => { await lockIn(tq, 3); return exec(tq, need, fn, true); }); }
        catch (e) { if (!isBusy(e)) throw e; }
        const p2 = plan(st, true);
        if (p2.kv.length) await runAll(q, p2.kv);
        return { out, used: st.used };
      }
      await runAll(q, p.lz.concat(p.kv));
      return { out, used: st.used };
    }
    throw new Error('읽을 것이 너무 많아요');
  }
  function isBusy(e) { return /lock timeout|lock_timeout|canceling statement|55P03/i.test(String(e && (e.code || '') + ' ' + e.message)); }
  async function run(qq, fn, locked) {
    const need = preNeed(qq);
    try {
      const r = locked ? await db.tx(async tq => { await lockIn(tq); return exec(tq, need, fn, true); }) : await exec(db.q, need, fn, false);
      if (qq.a && r.used.size) inst.act[qq.a] = [...new Set([...(inst.act[qq.a] || []), ...r.used])].slice(0, 20);
      return r.out;
    } catch (e) {
      const busy = isBusy(e);
      if (!busy) log.error(e && e.stack ? e.stack : String(e));
      return { lzErr: 1, body: busy ? { ok: false, err: 'busy', msg: '지금 다른 분이 저장 중이에요. 잠시 뒤에 다시 해 주세요.' } : { ok: false, err: 'server', msg: '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.' } };
    }
  }

  /** 앱이 보낸 요청(글자) → 답(글자) */
  async function handle(raw) {
    let qq = {};
    try { qq = JSON.parse(raw) || {}; } catch (e) { /* 아래 로직이 오류로 답함 */ }
    if (qq && qq.a === '_cron') return J(await cron(qq));
    const h = qq && core.H[qq.a], locked = !!(h && h.w);
    const r = await run(qq || {}, () => core.doPost({ postData: { contents: raw } }).getContent(), locked);
    return r && r.lzErr ? J(r.body) : r;
  }
  /** 매일 정리(수파베이스 예약 작업이 부름). 열쇠가 맞아야 해요 */
  async function cron(qq) {
    const r = await run({ a: '_cron' }, () => {
      const key = propApi.getProperty('CRON_KEY');
      if (!key || String(qq.key || '') !== key) return { ok: false, err: 'perm' };
      core.dailyMaintenance();
      return { ok: true };
    }, true);
    return r && r.lzErr ? r.body : r;
  }
  /** 관리용(시험·처음 준비): 서버 로직 함수를 잠금 안에서 실행 */
  async function op(fn) { const r = await run({}, () => fn(core), true); if (r && r.lzErr) throw new Error(r.body.msg); return r; }
  function doGet() { return J({ ok: true, app: core.APP, ver: core.VER, db: 'supabase' }); }
  return { handle, op, cron, doGet, core, inst, forget: () => { Object.keys(inst.tabs).forEach(dropTab); inst.props = null; } };
}
