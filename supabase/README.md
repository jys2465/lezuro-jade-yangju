# 수파베이스로 옮기기 (v3.2)

구글 시트 + 앱스크립트 서버를 **수파베이스(Postgres 데이터베이스 + Edge Function)** 로 옮기는 순서예요.
업무 규칙(로그인·결제·환불·추천·문의…)은 그대로이고, **저장하는 곳과 속도만 바뀝니다.** 회원들은 비밀번호를 다시 정할 필요가 없고, 로그인도 그대로 유지돼요.

| 파일 | 하는 일 |
|---|---|
| `schema.sql` | 표 만들기(1단계). 여러 번 실행해도 안전 |
| `붙여넣기/index.ts` | 서버 함수 한 파일(2단계). 수파베이스 화면에 통째로 붙여 넣음 |
| `cron.sql` | 매일 새벽 정리·백업 예약(3단계) |
| `../apps-script/옮기기.gs` | 구글 시트 자료를 수파베이스로 보내는 앱스크립트(4단계) |
| `../apps-script/Code.gs` | 예전 서버도 새 버전으로(옮긴 뒤 예전 서버가 저장을 받지 않게) |
| `functions/api/` | 서버 함수 원본(개발용: `core.js`는 `Code.gs`에서 자동으로 만듦, `engine.js`가 저장 담당) |

프로젝트 주소: `https://achlxwcfcqaffazlxuxe.supabase.co` (이미 `js/config.js`, `cron.sql`, `옮기기.gs`에 들어 있어요)

---

## 미리 해 둘 일 (낮에 해도 됨, 회원에게 영향 없음)

### 1단계 · 표 만들기 (2분)
1. 수파베이스 왼쪽 메뉴 **SQL Editor** → **New query**
2. `schema.sql` 내용을 통째로 붙여 넣고 **Run**
3. 아래에 `표 만들기 끝 ✅`이 나오면 성공

### 2단계 · 서버 함수 올리기 (5분)
1. 왼쪽 메뉴 **Edge Functions** → **Deploy a new function** → **Via Editor**
2. 편집기에 있는 예시 코드를 **모두 지우고**, `붙여넣기/index.ts` 내용을 통째로 붙여 넣기
3. 아래쪽 함수 이름(Function name)을 **`api`** 로 바꾸고 **Deploy function**
4. ★ **JWT 확인 끄기**: 올린 `api` 함수를 누르고 **Details**(또는 Settings)에서 **Verify JWT / Enforce JWT verification** 스위치를 **끄고 저장**
   - 앱은 로그인 열쇠(JWT) 없이 부르고, 로그인 확인은 함수 안에서 직접 해요. 이걸 안 끄면 모든 요청이 401 오류가 나요.
5. 확인: 휴대폰이나 PC 브라우저 주소창에 아래 주소를 열어 보세요.
   `https://achlxwcfcqaffazlxuxe.supabase.co/functions/v1/api`
   → `{"ok":true,"app":"parkgolf-note","ver":3.2,"db":"supabase"}` 가 보이면 성공
   → `401`이나 `Missing authorization header`가 보이면 4번(JWT 끄기)을 다시 확인

### 3단계 · 매일 정리 예약 (1분)
1. **SQL Editor** → **New query** → `cron.sql` 붙여 넣고 **Run**
2. 아래에 `lz-daily-api`, `lz-daily-sql` 두 줄이 나오면 성공
   - `pg_cron`이나 `pg_net` 오류가 나면: 왼쪽 **Database → Extensions**에서 `pg_cron`, `pg_net`을 켜고 다시 Run

---

## 바꾸는 날 (회원이 적은 밤, 약 20분)

순서가 중요해요. **4단계(자료 옮기기)와 5단계(앱 올리기)는 이어서** 해 주세요.

### 4단계 · 구글 시트 자료 옮기기
1. 구글 시트 → **확장 프로그램 → Apps Script**
2. `Code.gs` 내용을 모두 지우고 새 `apps-script/Code.gs`를 붙여 넣고 **저장**
3. 함수 고르는 곳에서 `setup` → **▶ 실행** (실행 로그에 "이미 준비되어 있어요"가 나오면 정상)
4. ★ **배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포** (주소는 그대로예요. 이걸 해야 예전 서버가 "옮겼어요" 안내를 보내요)
5. 왼쪽 **파일** 옆 **+** → **스크립트** → 이름 `옮기기` → `apps-script/옮기기.gs` 내용을 붙여 넣기
6. 맨 위 `var SB_SECRET = '';` 의 따옴표 안에 수파베이스 **Secret key**를 붙여 넣고 **저장**
   - 수파베이스 **Settings → API Keys → Secret keys** 의 `sb_secret_…` 옆 눈 모양 → 복사
   - 이 열쇠는 채팅·GitHub에 올리지 말고, 여기에만 잠깐 넣어요
7. 함수 고르는 곳에서 **`moveToSupabase`** → **▶ 실행** → 처음이면 권한 허용(외부 서비스 연결) 창에서 허용
8. 실행 로그에 **`옮기기 끝 ✅`** 과 표별 줄 수가 나오면 성공
   - 이 순간부터 예전 서버는 "서버를 새 곳으로 옮겼어요" 안내만 보내요(자료가 두 곳으로 나뉘지 않게)
9. `SB_SECRET`을 다시 `''`로 지우고 저장

### 5단계 · 앱 3.2.0 올리기
1. GitHub 저장소에 압축 파일의 앱 파일을 모두 덮어써서 올리기(`js/config.js`, `index.html`, `sw.js` 꼭 포함)
2. 1~2분 기다린 뒤 휴대폰에서 앱을 완전히 닫았다가 다시 열기 → **설정 맨 아래 "앱 버전 3.2.0"** 확인

### 6단계 · 확인
- 관리자·회원 계정으로 로그인 → 코스 목록 → 홀 기록 저장 → 관리자 회원 관리·결제 확인 화면
- 수파베이스 **Table Editor → `v_표별줄수`** 에서 줄 수가 옮기기 로그와 같은지

---

## 되돌리기 (문제가 생겼을 때)
1. 앱스크립트에서 `undoMoveToSupabase` 실행 → 예전 서버 다시 열림
2. `js/config.js`의 `API`를 예전 앱스크립트 주소로 바꿔 GitHub에 올리기(파일 안에 예전 주소가 적혀 있어요), `sw.js`의 VERSION 숫자 올리기
3. ⚠️ 수파베이스로 바꾼 뒤에 새로 저장된 기록·결제는 구글 시트에 없어요. 되돌릴 일이 생기면 바로(당일) 하세요.

## 평소 관리

| 하고 싶은 일 | 방법 |
|---|---|
| 자료 보기 | **Table Editor** → `v_회원`, `v_결제`, `v_코스`, `v_매장`, `v_환불`, `v_표별줄수` (읽기 전용) |
| 자료 고치기 | 앱(관리자 화면)에서 해 주세요. Table Editor에서 `lz` 표를 직접 고치면 서버가 바로 모를 수 있어요 |
| 관리자 비밀번호를 잊음 | SQL Editor에서 `select lz_reset_admin();` → 새 6자리(처음 들어가면 바로 바꾸게 돼요) |
| 백업 | 매일 새벽 `lz_bak` 표에 복사(매일 것 7일, 일요일 것 8주) |
| 서버 오류 보기 | **Edge Functions → api → Logs** |
| 매일 정리가 도는지 | SQL Editor에서 `select * from cron.job_run_details order by start_time desc limit 5;` |
| 프로젝트가 일시정지됨 | 무료 요금제는 1주일 동안 아무도 안 쓰면 멈춰요. 대시보드에서 **Restore project**. 매장이 매일 쓰면 보통 멈추지 않아요 |
| 비밀 열쇠를 바꾸고 싶음 | **Settings → API Keys → Secret keys**에서 새로 만들고 예전 것 지우기(앱은 비밀 열쇠를 쓰지 않아서 영향 없음) |

## 어떻게 동작하나요 (개발용)
- 모든 자료는 `lz` 표 하나에 들어가요(`tab` = 예전 시트 이름, `d` = 한 줄의 칸들). 바뀔 때마다 `v` 순번이 올라가요.
- 서버 함수는 작은 표(회원·설정·로그인…)를 메모리에 두고 **바뀐 줄만** 받아 와요. 큰 표(기록·그림·이력·로고)는 필요한 부분만 읽어요.
- 저장하는 요청은 데이터베이스 잠금으로 한 번에 하나씩 처리해요(두 번 승인·중복 가입 같은 꼬임 방지).
- `Code.gs`를 고치면 `python3 tools/build-edge.py`로 `functions/api/core.js`와 `붙여넣기/index.ts`를 다시 만들고, 2단계처럼 다시 붙여 넣어요.
- 시험: `node tests/sb-server.test.mjs`(업무 규칙 30), `node tests/sb-engine.test.mjs`(엔진 14), `node tests/sb-migrate.test.mjs`(옮기기), `node tests/sb-e2e.test.js`(화면 42). PGlite(메모리 Postgres)가 필요해요: `npm i @electric-sql/pglite@0.5.8` 후 `PGLITE_DIR=node_modules/@electric-sql/pglite`.
