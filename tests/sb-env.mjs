// 수파베이스 서버 시험 환경: 진짜 Postgres(PGlite, 메모리) + schema.sql + 엔진 + 서버 로직(core.js)
// PGlite 위치: 환경변수 PGLITE_DIR (없으면 scratchpad 의 sbdeps)
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..');
const DEP = process.env.PGLITE_DIR || '/tmp/claude-0/-home-claude/a6596b4a-8ad1-5d2a-94ed-adc61a154c8c/scratchpad/sbdeps/node_modules/@electric-sql/pglite';
const { PGlite } = await import(pathToFileURL(path.join(DEP, 'dist/index.js')).href);
const { pgcrypto } = await import(pathToFileURL(path.join(DEP, 'dist/contrib/pgcrypto.js')).href);
const { makeCore } = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/api/core.js')).href);
const { createEngine } = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/api/engine.js')).href);
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8');

export async function newDb() {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(`create role anon; create role authenticated; create role service_role; create schema if not exists extensions;`);
  await pg.exec(SCHEMA);
  const stats = { queries: 0 };
  const db = {
    q: (t, p) => { stats.queries++; return pg.query(t, p || []).then(r => r.rows); },
    tx: fn => pg.transaction(tx => fn((t, p) => { stats.queries++; return tx.query(t, p || []).then(r => r.rows); }))
  };
  return { pg, db, stats };
}
/** 서버 하나(엔진 하나). 같은 db 로 여러 개 만들면 "서버 여러 대" 시험 */
export function newServer(base, state, logs) {
  class D extends Date { constructor(...a) { if (a.length === 0) super(state.now); else super(...a); } static now() { return state.now; } }
  const engine = createEngine({ db: base.db, makeCore, Date: D, console: { log: () => {}, error: (...a) => logs.push(a.join(' ')) } });
  const call = async (payload, t) => JSON.parse(await engine.handle(JSON.stringify(t === undefined ? payload : Object.assign({ t }, payload))));
  return { engine, call, op: fn => engine.op(fn) };
}
export async function createSbEnv() {
  const base = await newDb(), state = { now: Date.now() }, logs = [];
  const srv = newServer(base, state, logs);
  const msg = await srv.op(c => c.setup());
  return Object.assign({ base, state, logs, msg, pg: base.pg, stats: base.stats, server: () => newServer(base, state, logs) }, srv);
}
