// @ts-nocheck
// 파크골프 공략노트 — 수파베이스 Edge Function "api"
// 앱이 보내는 요청(text/plain JSON)을 받아 서버 로직을 돌리고 답합니다. 예전 앱스크립트 웹 앱 주소 대신 이 함수 주소를 써요.
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { makeCore } from './core.js';
import { createEngine } from './engine.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10 });
const db = {
  q: (t, p) => sql.unsafe(t, p || []),
  tx: fn => sql.begin(tx => fn((t, p) => tx.unsafe(t, p || [])))
};
const engine = createEngine({ db, makeCore });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const head = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS);
  if (req.method !== 'POST') return new Response(engine.doGet(), { headers: head });
  const raw = await req.text();
  return new Response(await engine.handle(raw), { headers: head });
});
