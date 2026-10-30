/* 실제 서버를 띄우고 소켓으로 교사 1명 + 학생 여러 명을 흉내 내는 통합 테스트 */
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const XLSX = require('xlsx');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'eq-test-'));
Object.assign(process.env, { DATA_DIR: DATA, PORT: '3911', HTTPS_PORT: '3912', RESULT_SHOW_MS: '400', AI_DELAY_MS: '150', SOLO_WAIT_MS: '1500', REMATCH_WAIT_MS: '600', OFFLINE_FORFEIT_MS: '1500' });
const srv = require('../server');
const { io: client } = require('socket.io-client');
const U = 'http://localhost:3911';
const wait = ms => new Promise(r => setTimeout(r, ms));
const emit = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
async function until(fn, ms = 5000, label = '조건') { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(40); } throw new Error(label + ' 시간 초과'); }
function connect(url = U, opts = {}) { return new Promise(res => { const s = client(url, { transports: ['websocket'], ...opts }); s.on('connect', () => res(s)); }); }
function student(sock) { const st = { sock, me: null, pub: null }; sock.on('me', d => st.me = d); sock.on('pub', d => st.pub = d); return st; }

(async () => {
  srv.listen(); await wait(400);
  const T = await connect(); let tstate = null; T.on('teacher', d => tstate = d);
  const c = await emit(T, 'teacher:create', { mode: 'quiz' });
  assert.ok(c.ok && /^[A-Z2-9]{4}$/.test(c.code), '4자리 방 코드');
  const room = srv.rooms.get(c.code);

  // 학생 3명 입장 (같은 이름 중복 거부)
  const S = [];
  for (const n of ['민지', '준호', '하늘']) { const s = student(await connect()); const r = await emit(s.sock, 'student:join', { code: c.code.toLowerCase(), name: n }); assert.ok(r.ok, n + ' 입장'); s.sid = r.sid; s.token = r.token; S.push(s); }
  const dup = await emit((await connect()), 'student:join', { code: c.code, name: '민지' });
  assert.ok(!dup.ok, '접속 중인 같은 이름은 거부');

  // 시작 → 2명 매칭 + 1명 AI
  assert.ok((await emit(T, 'teacher:start', {})).ok);
  await until(() => S.every(s => s.me?.match), 3000, '모두 매칭');
  const aiPlayer = S.find(s => s.me.match.opp.ai), humans = S.filter(s => !s.me.match.opp.ai);
  assert.ok(aiPlayer && humans.length === 2, '홀수 1명은 AI와 대전');
  console.log('✓ 시작하면 2명씩 자동 매칭, 남는 1명은 AI 대전');

  // 모드 전환 버그(이전 버전) 확인: 퀴즈 → 말하기 전환 시 말하기 문장으로 즉시 교체
  const first = humans.find(s => s.me.match.myTurn);
  assert.equal(first.me.match.question.mode, 'quiz');
  await emit(T, 'teacher:mode', { mode: 'speak' });
  await until(() => first.me.match.question?.mode === 'speak', 2000, '말하기 문장 교체');
  assert.ok(/[a-z]/i.test(first.me.match.question.text) && !first.me.match.question.options, '말하기 문장은 영어 문장, 보기 없음');
  await emit(T, 'teacher:mode', { mode: 'quiz' });
  await until(() => first.me.match.question?.mode === 'quiz' && first.me.match.question.options?.length === 5, 2000, '퀴즈 문제 교체');
  console.log('✓ 교사가 활동을 바꾸면 해당 활동의 문제로 바로 바뀜(이전 오류 해결)');

  // 단원 선택: 12단원만 → 기다리던 문제가 12단원 문제로 교체
  const { UNITS } = require('../units');
  assert.ok((await emit(T, 'teacher:units', { sel: ['u12'] })).ok);
  await until(() => first.me.match.question && UNITS.u12.quiz.some(x => x.text === first.me.match.question.text), 2000, '12단원 문제');
  assert.equal(first.me.match.question.unit, 12);
  assert.ok(!(await emit(T, 'teacher:units', { sel: ['custom'] })).ok, '올린 문제가 없으면 선택 불가');
  assert.ok(!(await emit(T, 'teacher:units', { sel: [] })).ok, '하나 이상 골라야 함');
  assert.ok((await emit(T, 'teacher:units', { sel: ['u10', 'u11'] })).ok);
  await until(() => [10, 11].includes(first.me.match.question?.unit), 2000, '10·11단원 섞기');
  const T0 = await connect(); const c0 = await emit(T0, 'teacher:create', { mode: 'speak', units: ['u11', 'u12'] });
  assert.deepEqual(srv.rooms.get(c0.code).sel, ['u11', 'u12']); T0.close();
  console.log('✓ 교사가 단원(10·11·12, 여러 개 가능)을 고르면 그 단원 문제가 나옴');
  assert.ok((await emit(T, 'teacher:turnSec', { sec: 30 })).ok, '30초 선택 가능');
  assert.ok(!(await emit(T, 'teacher:walls', { n: 4 })).ok && !(await emit(T, 'teacher:walls', { n: 11 })).ok);
  assert.ok((await emit(T, 'teacher:walls', { n: 6 })).ok); assert.equal(room.wallCount, 6);
  await emit(T, 'teacher:walls', { n: 10 }); await emit(T, 'teacher:turnSec', { sec: 90 });
  console.log('✓ 차례 시간 30초, 벽 개수 5~10개 설정');

  // 퀴즈: 오답이면 차례가 넘어감
  const mid = first.me.match.id, m = room.matches.get(mid);
  const realAns = m.q.answer, wrong = (realAns + 1) % 5;
  const wr = await emit(first.sock, 'game:quiz', { choice: wrong });
  assert.ok(wr.ok && !wr.success && wr.answer === realAns);
  const second = humans.find(s => s !== first);
  await until(() => second.me.match.myTurn && second.me.match.question, 2000, '오답 후 상대 차례');
  const again = await emit(first.sock, 'game:quiz', { choice: 0 });
  assert.ok(!again.ok, '차례가 넘어간 뒤엔 다시 풀 수 없음(찍기 방지)');
  console.log('✓ 5지선다 오답이면 차례가 상대에게 넘어감(찍기 방지)');

  // 정답 → 이동
  const ans = room.matches.get(mid).q.answer;
  assert.ok((await emit(second.sock, 'game:action', { kind: 'move', r: 1, c: 4 })).ok === false, '정답 전 이동 불가');
  assert.ok((await emit(second.sock, 'game:quiz', { choice: ans })).success);
  const my = second.me.match.my, start = room.matches.get(mid).board.p[my];
  const target = my === 0 ? [start[0] - 1, start[1]] : [start[0] + 1, start[1]];
  assert.ok((await emit(second.sock, 'game:action', { kind: 'move', r: target[0], c: target[1] })).ok);
  await until(() => first.me.match.myTurn, 2000, '이동 후 차례 전환');
  console.log('✓ 정답을 맞혀야 이동 가능, 이동 후 차례 전환');

  // 일시정지 중 AI 차례 → 재개하면 AI가 정상적으로 둔다(이전 오류)
  const am = room.matches.get(aiPlayer.me.match.id);
  const aiIdx = am.ids.indexOf('AI');
  if (am.board.turn !== aiIdx) {
    assert.ok((await emit(aiPlayer.sock, 'game:quiz', { choice: am.q.answer })).success);
    const p = am.board.p[1 - aiIdx]; const legal = require('../engine').legalMoves(am.board, 1 - aiIdx)[0];
    await emit(T, 'teacher:pause', {});
    await emit(T, 'teacher:pause', {}); // 바로 재개
    assert.ok((await emit(aiPlayer.sock, 'game:action', { kind: 'move', r: legal[0], c: legal[1] })).ok, p);
  }
  const movesBefore = am.board.moves;
  await emit(T, 'teacher:pause', {}); assert.equal(room.paused, true);
  await wait(500); assert.equal(am.board.moves, movesBefore, '정지 중 AI도 멈춤');
  await emit(T, 'teacher:pause', {});
  await until(() => am.board.moves > movesBefore, 2000, '재개 후 AI 행동');
  console.log('✓ AI 차례에 일시정지 → 재개해도 AI가 바로 이어서 둠(이전 오류 해결)');

  // 교사 새로고침(새 연결)으로 다시 들어오기
  const T2 = await connect(); let t2 = null; T2.on('teacher', d => t2 = d);
  assert.ok((await emit(T2, 'teacher:resume', { code: c.code, token: c.token })).ok);
  await until(() => t2?.students?.length === 3, 2000, '교사 화면 복구');
  assert.ok(!(await emit(await connect(), 'teacher:resume', { code: c.code, token: 'x' })).ok, '토큰 없으면 거부');
  console.log('✓ 교사 화면 새로고침 후 같은 교실로 복귀(이전 오류 해결)');

  // 말하기: 2번 실패하면 차례 넘김
  await emit(T, 'teacher:mode', { mode: 'speak' });
  const turnS = humans.find(s => s.me.match.myTurn);
  const other = humans.find(s => s !== turnS);
  await until(() => turnS.me.match.question?.mode === 'speak', 2000, '말하기 문제');
  const sentence = turnS.me.match.question.text;
  let r1 = await emit(turnS.sock, 'game:speak', { alternatives: ['banana apple'] });
  assert.ok(r1.ok && !r1.success && r1.attempts === 1);
  await until(() => tstate?.help?.some(h => h.attempts === 1), 2000, '교사 화면 재시도 알림');
  r1 = await emit(turnS.sock, 'game:speak', { alternatives: ['hello'] });
  assert.ok(!r1.success && r1.attempts === 2);
  await until(() => other.me.match.myTurn, 2000, '2번 실패 후 차례 넘김');
  const r2 = await emit(other.sock, 'game:speak', { alternatives: [other.me.match.question.text.toUpperCase().replace(/[.?!,]/g, '')] });
  assert.ok(r2.success, '정확히 읽으면 성공');
  console.log('✓ 말하기: 2번 기회, 정확히 읽으면 성공 / 2번 실패하면 차례 넘김');
  // 교사 승인
  await emit(other.sock, 'game:action', { kind: 'wall', r: 3, c: 3, o: 'h' });
  await until(() => turnS.me.match.myTurn, 2000);
  await emit(turnS.sock, 'game:help', {});
  const appr = await emit(T, 'teacher:approve', { matchId: turnS.me.match.id });
  assert.ok(appr.ok, '교사 승인');
  await until(() => turnS.me.match.phase === 'action', 2000);
  const bad = await emit(turnS.sock, 'game:action', { kind: 'wall', r: 3, c: 3, o: 'v' });
  assert.ok(!bad.ok && /교차|겹/.test(bad.message), '교차 벽 거부 메시지');
  console.log('✓ 교사 승인으로 통과, 잘못된 벽은 이유와 함께 거부');

  // 경기 종료 → 결과 → 자동 재매칭(이번엔 다른 상대 우선)
  const hm = room.matches.get(turnS.me.match.id), w = hm.board.turn;
  hm.board.p[w] = w === 0 ? [1, 0] : [7, 0];
  hm.board.p[1 - w] = w === 0 ? [8, 8] : [0, 8];
  hm.board.walls = [];
  assert.ok((await emit(turnS.sock, 'game:action', { kind: 'move', r: w === 0 ? 0 : 8, c: 0 })).ok);
  await until(() => turnS.me.me.state === 'result' && turnS.me.match?.ended, 2000, '결과 화면');
  assert.equal(turnS.me.me.w, 1); assert.equal(other.me.me.l, 1);
  await until(() => turnS.me.me.state === 'match' && other.me.me.state === 'match', 4000, '자동 재매칭');
  console.log('✓ 경기가 끝나면 승패 기록 → 결과 화면 → 자동으로 다음 경기 시작');
  { // 방금 대결한 친구와 다시 붙지 않음 → 새 상대(또는 AI)
    const m1 = room.matches.get(room.students.get(turnS.sid).matchId), m2 = room.matches.get(room.students.get(other.sid).matchId);
    assert.ok(!m1.ids.includes(other.sid) && !m2.ids.includes(turnS.sid), '같은 상대와 재매칭 금지');
  }
  console.log('✓ 이미 대결한 친구와는 다시 매칭되지 않음');

  // 늦게 들어온 학생도 자동 매칭
  const late = student(await connect());
  assert.ok((await emit(late.sock, 'student:join', { code: c.code, name: '늦은학생' })).ok);
  await until(() => late.me?.me.state === 'match' || late.me?.me.state === 'queue', 2000);
  await until(() => late.me?.me.state === 'match', 4000, '늦은 학생 매칭');
  console.log('✓ 시작 후 늦게 들어온 학생도 자동으로 경기에 들어감');

  // 연결 끊긴 학생은 같은 이름으로 다시 들어오면 기록 유지
  const before = room.students.get(turnS.sid).w;
  turnS.sock.disconnect(); await wait(200);
  const back = student(await connect());
  const rj = await emit(back.sock, 'student:join', { code: c.code, name: '  ' + room.students.get(turnS.sid).name + ' ' });
  assert.ok(rj.ok && rj.rejoined && rj.sid === turnS.sid, '이름으로 재입장');
  await until(() => back.me?.me.w === before, 2000);
  console.log('✓ 태블릿이 꺼졌던 학생은 같은 이름으로 다시 들어와 기록을 이어감');

  // 문제 업로드(xlsx/csv)
  const mk = aoa => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
  const up = async (buf, kind, name = 'q.xlsx', token = c.token) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); const r = await fetch(`${U}/api/rooms/${c.code}/upload?kind=${kind}`, { method: 'POST', headers: { 'x-teacher-token': token }, body: fd }); return { status: r.status, body: await r.json() }; };
  let u = await up(mk([['문장', '뜻'], ['I can swim.', '나는 수영할 수 있어.'], ['Turn right.', '']]), 'speak');
  assert.equal(u.body.count, 2); assert.equal(room.custom.speak.length, 2); assert.deepEqual(room.sel, ['custom']);
  u = await up(mk([['문제', '보기1', '보기2', '보기3', '보기4', '보기5', '정답'], ['사과는?', 'apple', 'banana', 'grape', 'melon', 'peach', 1], ['포도는?', 'apple', 'banana', 'grape', 'melon', 'peach', '③']]), 'quiz');
  assert.equal(u.body.count, 2); assert.equal(room.custom.quiz[1].answer, 2);
  u = await up(mk([['문제', '보기1', '보기2'], ['x', 'a', 'b']]), 'quiz');
  assert.equal(u.status, 400); assert.match(u.body.error, /2행/);
  u = await up(Buffer.from('﻿문장\nWhere is the bank?\n', 'utf8'), 'speak', 'a.csv');
  assert.equal(u.body.count, 1);
  const cpBuf = Buffer.concat([Buffer.from([0xb9, 0xae, 0xc0, 0xe5]), Buffer.from('\nGo straight.\n')]); // 엑셀 한글 CSV(CP949)의 '문장'
  u = await up(cpBuf, 'speak', 'b.csv'); assert.equal(u.body.count, 1);
  u = await up(mk([['문장'], ['x']]), 'speak', 'q.xlsx', 'wrong'); assert.equal(u.status, 403);
  const tpl = await fetch(`${U}/api/template/quiz.xlsx`); assert.equal(tpl.status, 200);
  const tplRows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(await tpl.arrayBuffer())).Sheets['5지선다 문제']);
  assert.ok(tplRows.length >= 5 && tplRows[0]['보기5']);
  console.log('✓ 엑셀/CSV 문제 업로드(말하기·5지선다 따로), 잘못된 행 안내, 예시 양식 다운로드');

  // HTTPS로도 접속 가능(태블릿 마이크용)
  const hs = await connect('https://localhost:3912', { rejectUnauthorized: false });
  assert.ok(hs.connected); hs.close();
  console.log('✓ HTTPS 주소(마이크 사용 가능)로도 같은 교실에 접속');

  // 종료 → 순위
  const ex0 = await fetch(`${U}/api/rooms/${c.code}/export.xlsx`, { headers: { 'x-teacher-token': c.token } }); assert.equal(ex0.status, 200);
  assert.ok((await emit(T, 'teacher:end', {})).ok);
  await until(() => late.pub?.rankings?.length === 4 && back.pub?.rankings?.length === 4, 2000, '학생 화면 최종 순위');
  const rk = room.rankings;
  assert.ok(rk.every((p, i) => i === 0 || p.score <= rk[i - 1].score), '총점 순 정렬');
  const ex = await fetch(`${U}/api/rooms/${c.code}/export.xlsx`, { headers: { 'x-teacher-token': c.token } });
  const wb = XLSX.read(Buffer.from(await ex.arrayBuffer()));
  assert.deepEqual(wb.SheetNames, ['최종 순위', '학습 분석', '오답 분석', '경기 기록']);
  assert.equal((await fetch(`${U}/api/rooms/${c.code}/export.xlsx`)).status, 403);
  assert.ok(!(await emit(await connect(), 'student:join', { code: c.code, name: '새학생' })).ok, '끝난 수업은 입장 불가');
  console.log('✓ 게임 끝내기 → 총점 순위 확정, 학생 화면에 순위, 엑셀 4개 시트 다운로드');

  // 서버 재시작 후 복원(진행 중 수업은 일시정지 상태로)
  const T3 = await connect(); const c2 = await emit(T3, 'teacher:create', { mode: 'speak' });
  const s3 = student(await connect()); await emit(s3.sock, 'student:join', { code: c2.code, name: '복원' });
  await emit(T3, 'teacher:start', {}); await wait(300);
  srv.persistNow();
  for (const s of [T, T2, T3, s3.sock, late.sock, back.sock, ...S.map(x => x.sock)]) s.close();
  srv.stop(); await wait(300);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: '3913', HTTPS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => log += d);
  await until(() => /서버가 켜졌습니다/.test(log), 5000, '재시작');
  const T4 = await new Promise(res => { const s = client('http://localhost:3913', { transports: ['websocket'] }); s.on('connect', () => res(s)); });
  let t4 = null; T4.on('teacher', d => t4 = d);
  assert.ok((await emit(T4, 'teacher:resume', { code: c2.code, token: c2.token })).ok);
  await until(() => t4, 2000);
  assert.equal(t4.status, 'playing'); assert.equal(t4.paused, true);
  T4.close(); child.kill();
  console.log('✓ 서버를 껐다 켜도 수업이 복원됨(일시정지 상태로 시작)');
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log('\n모든 교실 통합 테스트 통과');
  process.exit(0);
})().catch(e => { console.error('✗ 실패:', e); process.exit(1); });
