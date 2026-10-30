/* English Quoridor 교실 서버
   - 교사가 방을 만들고, 학생이 입장한 뒤 시작을 누르면 2명씩 자동 매칭(홀수면 AI)
   - 경기가 끝나면 5초 결과 화면 후 자동으로 다음 상대와 매칭(계속 진행)
   - 교사가 '게임 종료'를 누르면 총점으로 최종 순위 확정 */
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https'), os = require('os'), crypto = require('crypto');
const express = require('express'), { Server } = require('socket.io'), multer = require('multer'), XLSX = require('xlsx');
const E = require('./engine'), speech = require('./speech'), Q = require('./questions'), { UNITS, UNIT_IDS } = require('./units');
for (const id of UNIT_IDS) for (const k of ['quiz', 'speak']) UNITS[id][k].forEach(x => { x.unit = UNITS[id].no; });
const SOURCES = [...UNIT_IDS, 'custom'];

const PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const USE_HTTPS = process.env.HTTPS !== '0';
const MAX_STUDENTS = Number(process.env.MAX_STUDENTS || 30);
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STATE_DIR = path.join(DATA_DIR, 'state'), RESULTS_DIR = path.join(DATA_DIR, 'results');
const RESULT_SHOW_MS = Number(process.env.RESULT_SHOW_MS || 6000);   // 결과 화면 표시 시간
const AI_DELAY_MS = Number(process.env.AI_DELAY_MS || 1400);
const OFFLINE_FORFEIT_MS = Number(process.env.OFFLINE_FORFEIT_MS || 60000);
const SOLO_WAIT_MS = Number(process.env.SOLO_WAIT_MS || 15000);       // 혼자 남았을 때 AI 배정까지 대기
const REMATCH_WAIT_MS = Number(process.env.REMATCH_WAIT_MS || 8000);  // 방금 상대와 다시 붙기 전 대기
const MAX_MOVES = 200;
const POINTS = { win: 10, draw: 5, mission: 1 };
for (const d of [STATE_DIR, RESULTS_DIR]) fs.mkdirSync(d, { recursive: true });

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/engine.js', (_q, res) => res.type('js').sendFile(path.join(__dirname, 'engine.js')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const servers = [http.createServer(app)];
const io = new Server({ maxHttpBufferSize: 1e6, pingTimeout: 20000 });
const rooms = new Map();
const now = () => Date.now();
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; }
const rate = s => (s.w + s.l + s.d) ? Math.round(s.w / (s.w + s.l + s.d) * 100) : 0;
const missions = s => (s.stats.quizOk || 0) + (s.stats.speakOk || 0);
const scoreOf = s => s.w * POINTS.win + s.d * POINTS.draw + missions(s) * POINTS.mission;

/* ───────────── 방 · 학생 ───────────── */
function cleanSel(sel) { const v = [...new Set((Array.isArray(sel) ? sel : []).filter(x => SOURCES.includes(x)))]; return v.length ? v : ['u10']; }
function createRoom(mode, units) {
  const r = {
    code: newCode(), token: rid(24), mode: mode === 'speak' ? 'speak' : 'quiz', turnSec: 90, wallCount: 10,
    sel: cleanSel(units).filter(x => x !== 'custom').length ? cleanSel(units).filter(x => x !== 'custom') : ['u10'],
    custom: { quiz: [], speak: [], name: { quiz: '', speak: '' } },
    status: 'lobby', paused: false, createdAt: now(), startedAt: null, endedAt: null,
    students: new Map(), matches: new Map(), history: [], matchSeq: 0, rankings: null, teacherSockets: new Set()
  };
  rooms.set(r.code, r);
  return r;
}
function newStudent(name, av) {
  return { id: rid(8), token: rid(16), name, av, socket: null, goneAt: null, state: 'idle', since: 0, resultUntil: 0, matchId: null, lastMatchId: null,
    w: 0, l: 0, d: 0, ai: 0, games: 0, stats: { quizOk: 0, quizNo: 0, speakOk: 0, speakNo: 0, approved: 0, timeouts: 0 }, qstats: {}, opps: {}, lastOpp: null, recent: [], joinedAt: now() };
}
const online = s => !!s.socket;

/* ───────────── 문제 ───────────── */
/** 교사가 고른 단원(여러 개 가능) + 직접 올린 문제를 합친 문제 은행. 비어 있으면 10~12단원 전체로 대체 */
function bankOf(r, mode) {
  let items = [];
  for (const id of r.sel) items = items.concat(id === 'custom' ? r.custom[mode] : (UNITS[id]?.[mode] || []));
  if (items.length) return { items, fallback: false };
  return { items: UNIT_IDS.flatMap(id => UNITS[id][mode]), fallback: true };
}
function selLabel(r) {
  const nos = r.sel.filter(x => x !== 'custom').map(x => UNITS[x].no).sort((a, b) => a - b);
  const parts = []; if (nos.length) parts.push(nos.join('·') + '단원'); if (r.sel.includes('custom')) parts.push('직접 올린 문제');
  return parts.join(' + ');
}
function repickWaiting(r) {
  for (const m of r.matches.values()) if (m.phase === 'question') { m.q = pickQuestion(r, r.mode, r.students.get(m.ids[m.board.turn])); m.attempts = 0; m.help = false; }
}
function pickQuestion(r, mode, s) {
  const bank = bankOf(r, mode).items;
  let idx = Math.floor(Math.random() * bank.length);
  if (s && bank.length > 1) {
    const recent = new Set(s.recent);
    for (let k = 0; k < 8 && recent.has(mode + idx); k++) idx = Math.floor(Math.random() * bank.length);
    s.recent = [...s.recent.slice(-Math.min(6, bank.length - 1)), mode + idx];
  }
  return { ...bank[idx], mode, qid: mode + ':' + idx };
}
function qKey(q) { return crypto.createHash('sha1').update(q.mode + '|' + q.text + '|' + JSON.stringify(q.options || [])).digest('hex').slice(0, 14); }
function recordQuestion(s, q, success, choice) {
  const k = qKey(q), log = s.qstats;
  if (!log[k] && Object.keys(log).length >= 400) return;
  const e = log[k] || (log[k] = { key: k, mode: q.mode, unit: q.unit || null, text: q.text, options: q.options || null, answer: q.mode === 'quiz' ? q.answer : null, ok: 0, no: 0, picks: {} });
  if (success) e.ok++; else { e.no++; if (q.mode === 'quiz' && Number.isInteger(choice)) e.picks[choice] = (e.picks[choice] || 0) + 1; }
}

/* ───────────── 경기 ───────────── */
function startMatch(r, a, b) {
  const ids = [a.id, b ? b.id : 'AI'];
  if (Math.random() < 0.5 && b) ids.reverse(); // 선공(파랑)을 무작위로
  const m = { id: rid(6), no: ++r.matchSeq, ids, board: E.initial(r.wallCount || 10), phase: 'question', q: null, attempts: 0, deadline: 0, remaining: 0, aiAt: 0,
    startedAt: now(), endedAt: null, winner: null, reason: '', side: [{ ok: 0, no: 0 }, { ok: 0, no: 0 }], last: null, help: false };
  r.matches.set(m.id, m);
  for (const sid of ids) {
    const s = r.students.get(sid); if (!s) continue;
    const other = ids.find(x => x !== sid);
    s.state = 'match'; s.matchId = m.id; s.games++;
    s.opps[other] = (s.opps[other] || 0) + 1; s.lastOpp = other;
    if (other === 'AI') s.ai++;
  }
  beginTurn(r, m);
  return m;
}
const avOf = (r, sid) => sid === 'AI' ? 'ai' : (r.students.get(sid)?.av ?? 0);
const nameOf = (r, sid) => sid === 'AI' ? 'AI 로봇' : (r.students.get(sid)?.name || '(나간 학생)');
function beginTurn(r, m) {
  if (m.phase === 'ended') return;
  const sid = m.ids[m.board.turn];
  m.attempts = 0; m.help = false;
  m.deadline = now() + r.turnSec * 1000; m.remaining = r.turnSec * 1000;
  if (sid === 'AI') { m.phase = 'ai'; m.q = null; m.aiAt = now() + AI_DELAY_MS; }
  else { m.phase = 'question'; m.q = pickQuestion(r, r.mode, r.students.get(sid)); }
}
function passTurn(r, m) {
  E.skip(m.board);
  if (m.board.moves >= MAX_MOVES) return finishByDistance(r, m);
  beginTurn(r, m);
}
function afterAction(r, m) {
  if (m.board.winner !== null) return endMatch(r, m, m.board.winner, '도착');
  if (m.board.moves >= MAX_MOVES) return finishByDistance(r, m);
  beginTurn(r, m);
}
function finishByDistance(r, m) {
  const d0 = E.distance(m.board, 0), d1 = E.distance(m.board, 1);
  endMatch(r, m, d0 === d1 ? null : d0 < d1 ? 0 : 1, '행동 수 제한(남은 거리 비교)');
}
function endMatch(r, m, winner, reason, { abort = false } = {}) {
  if (m.phase === 'ended') return;
  m.phase = 'ended'; m.winner = winner; m.reason = reason; m.endedAt = now(); m.q = null; m.aborted = abort;
  if (winner !== null && m.board.winner === null) m.board.winner = winner;
  const ps = m.ids.map(sid => r.students.get(sid));
  if (!abort) {
    if (winner === null) ps.forEach(s => s && s.d++);
    else { if (ps[winner]) ps[winner].w++; if (ps[1 - winner]) ps[1 - winner].l++; }
    r.history.unshift({ id: m.id, no: m.no, names: m.ids.map(x => nameOf(r, x)), avs: m.ids.map(x => avOf(r, x)), ids: [...m.ids], winner, reason, moves: m.board.moves,
      durationSec: Math.round((m.endedAt - m.startedAt) / 1000), endedAt: m.endedAt, board: E.clone(m.board), side: m.side });
    r.history = r.history.slice(0, 300);
  }
  for (const s of ps) if (s && s.matchId === m.id) { s.state = 'result'; s.resultUntil = now() + RESULT_SHOW_MS; s.lastMatchId = m.id; s.matchId = null; }
}
function cleanupMatches(r) {
  // 끝난 경기는 결과 화면이 끝날 때까지만 보관
  for (const m of r.matches.values()) if (m.phase === 'ended' && now() - m.endedAt > RESULT_SHOW_MS + 20000) r.matches.delete(m.id);
}

/* ───────────── 자동 매칭 ───────────── */
function matchmake(r, { kickoff = false } = {}) {
  if (r.status !== 'playing' || r.paused) return;
  const waiting = [...r.students.values()].filter(s => s.state === 'queue' && online(s)).sort((a, b) => a.since - b.since);
  const humanGames = [...r.matches.values()].filter(m => m.phase !== 'ended' && !m.ids.includes('AI')).length;
  const comingBack = [...r.students.values()].filter(s => s.state === 'result' && online(s)).length;
  if (kickoff) waiting.sort(() => Math.random() - .5);
  void humanGames; void comingBack;
  // 한 번 대결한 친구와는 다시 매칭하지 않음
  const fresh = (a, b) => !a.opps[b.id] && !b.opps[a.id];
  const left = [];
  while (waiting.length) {
    const a = waiting.shift();
    const cands = waiting.filter(b => fresh(a, b));
    if (!cands.length) { left.push(a); continue; }
    // 새 상대 후보가 가장 적은 친구부터 짝지어 남는 사람을 줄임
    const choices = b => waiting.filter(x => x !== b && fresh(b, x)).length;
    cands.sort((x, y) => choices(x) - choices(y));
    const b = cands[0]; waiting.splice(waiting.indexOf(b), 1);
    startMatch(r, a, b);
  }
  // 짝이 없는 학생: 아직 안 붙어 본 친구가 경기 중이면 잠깐 기다리고, 없으면 AI와 매칭
  for (const a of left) {
    const waited = now() - a.since;
    const unplayedBusy = [...r.students.values()].some(s => s !== a && online(s) && (s.state === 'match' || s.state === 'result') && fresh(a, s));
    if (kickoff || !unplayedBusy || waited >= SOLO_WAIT_MS) startMatch(r, a, null);
  }
}
function enqueue(s) { s.state = 'queue'; s.since = now(); s.matchId = null; }

/* ───────────── 주기 처리(타이머·AI·매칭·연결 끊김) ───────────── */
function tick(r) {
  if (r.status !== 'playing' || r.paused) return;
  const t = now();
  let changed = false;
  for (const m of r.matches.values()) {
    if (m.phase === 'ended') continue;
    const sid = m.ids[m.board.turn];
    if (sid === 'AI') {
      if (t >= m.aiAt) {
        const act = E.aiAction(m.board), who = m.board.turn;
        let ok = false;
        if (act?.kind === 'move') ok = E.move(m.board, m.board.turn, act.r, act.c);
        else if (act?.kind === 'wall') ok = E.place(m.board, m.board.turn, act.r, act.c, act.o);
        if (!ok) E.skip(m.board);
        m.last = { who, kind: ok ? act.kind : 'skip', at: t };
        afterAction(r, m); changed = true;
      }
      continue;
    }
    if (t >= m.deadline) {
      const s = r.students.get(sid);
      if (s) s.stats.timeouts++;
      m.last = { who: m.board.turn, kind: 'timeout', at: t };
      passTurn(r, m); changed = true;
      continue;
    }
    // 오래 연결이 끊긴 학생은 기권 처리
    for (let i = 0; i < 2; i++) {
      const s = r.students.get(m.ids[i]);
      if (s && !online(s) && s.goneAt && t - s.goneAt > OFFLINE_FORFEIT_MS && m.phase !== 'ended') { endMatch(r, m, 1 - i, '연결 끊김'); changed = true; }
    }
  }
  for (const s of r.students.values()) {
    if (s.state === 'result' && t >= s.resultUntil) { enqueue(s); changed = true; }
  }
  const before = r.matchSeq;
  matchmake(r);
  if (r.matchSeq !== before) changed = true;
  cleanupMatches(r);
  if (changed) flush(r);
  else if (Math.floor(t / 1000) !== r._lastSec) { r._lastSec = Math.floor(t / 1000); flush(r); } // 남은 시간 표시용 1초 갱신
}

/* ───────────── 화면에 보낼 데이터 ───────────── */
function secsLeft(r, m) { return Math.max(0, Math.ceil((r.paused ? m.remaining : m.deadline - now()) / 1000)); }
function publicMatch(r, m) {
  return { id: m.id, no: m.no, ids: m.ids, names: m.ids.map(x => nameOf(r, x)), avs: m.ids.map(x => avOf(r, x)), board: m.board, phase: m.phase, ended: m.phase === 'ended',
    winner: m.winner, reason: m.reason, secs: m.phase === 'ended' ? 0 : secsLeft(r, m), startedAt: m.startedAt, help: m.help, attempts: m.attempts };
}
function playerCard(s) { return { id: s.id, name: s.name, av: s.av ?? 0, w: s.w, l: s.l, d: s.d, rate: rate(s), online: online(s), state: s.state, ai: s.ai, games: s.w + s.l + s.d }; }
function publicState(r) {
  const live = [...r.matches.values()].filter(m => m.phase !== 'ended');
  return { code: r.code, mode: r.mode, unitLabel: selLabel(r), status: r.status, paused: r.paused, turnSec: r.turnSec, wallCount: r.wallCount || 10,
    players: [...r.students.values()].map(playerCard),
    matches: live.sort((a, b) => a.no - b.no).map(m => publicMatch(r, m)),
    waiting: [...r.students.values()].filter(s => s.state === 'queue' && online(s)).map(s => s.name),
    rankings: r.status === 'ended' ? r.rankings : null };
}
function personalState(r, s) {
  const m = r.matches.get(s.state === 'match' ? s.matchId : s.state === 'result' ? s.lastMatchId : null);
  let match = null;
  if (m) {
    const my = m.ids.indexOf(s.id);
    const opp = m.ids[1 - my];
    const os = r.students.get(opp);
    match = { ...publicMatch(r, m), my, myTurn: m.board.turn === my && m.phase !== 'ended',
      opp: opp === 'AI' ? { name: 'AI 로봇', ai: true, av: 'ai' } : os ? playerCard(os) : { name: '(나간 학생)' },
      question: m.q && m.board.turn === my ? { mode: m.q.mode, unit: m.q.unit || null, text: m.q.text, options: m.q.options || null, meaning: m.q.meaning || '' } : null,
      oppQuestion: m.q && m.board.turn !== my ? { mode: m.q.mode, text: m.q.text } : null,
      attempts: m.attempts, last: m.last, side: m.side, aborted: !!m.aborted, endedAt: m.endedAt, durationSec: m.endedAt ? Math.round((m.endedAt - m.startedAt) / 1000) : null };
  }
  return { me: { ...playerCard(s), score: scoreOf(s), missions: missions(s), resultLeft: s.state === 'result' ? Math.max(0, Math.ceil((s.resultUntil - now()) / 1000)) : 0, waitSec: s.state === 'queue' ? Math.floor((now() - s.since) / 1000) : 0 }, match };
}
function teacherState(r) {
  const students = [...r.students.values()].map(s => ({ ...playerCard(s), score: scoreOf(s), missions: missions(s), stats: s.stats }));
  const help = [...r.matches.values()].filter(m => m.phase === 'question' && r.mode === 'speak' && (m.help || m.attempts > 0)).map(m => ({ matchId: m.id, no: m.no, name: nameOf(r, m.ids[m.board.turn]), attempts: m.attempts, help: m.help, text: m.q?.text || '' }));
  const totalGames = r.history.length, aiGames = r.history.filter(h => h.ids.includes('AI')).length;
  return { code: r.code, mode: r.mode, status: r.status, paused: r.paused, turnSec: r.turnSec, wallCount: r.wallCount || 10, maxStudents: MAX_STUDENTS,
    bank: { sel: r.sel, label: selLabel(r),
      units: UNIT_IDS.map(id => ({ id, no: UNITS[id].no, title: UNITS[id].title, topic: UNITS[id].topic, quiz: UNITS[id].quiz.length, speak: UNITS[id].speak.length })),
      custom: { quiz: r.custom.quiz.length, speak: r.custom.speak.length, name: r.custom.name },
      active: Object.fromEntries(['quiz', 'speak'].map(k => { const b = bankOf(r, k); return [k, { count: b.items.length, fallback: b.fallback, preview: b.items.slice(0, 5).map(x => (x.unit ? `[${x.unit}단원] ` : '') + x.text) }]; })) },
    students, help, totalGames, aiGames, rankings: r.rankings,
    recent: r.history.slice(0, 8).map(h => ({ no: h.no, names: h.names, avs: h.avs, winner: h.winner, reason: h.reason, endedAt: h.endedAt, durationSec: h.durationSec, board: h.board })) };
}
function flush(r) {
  if (r._flushTimer) return;
  r._flushTimer = setTimeout(() => {
    r._flushTimer = null;
    const pub = publicState(r);
    io.to('room:' + r.code).emit('pub', pub);
    for (const s of r.students.values()) if (s.socket) io.to(s.socket).emit('me', personalState(r, s));
    io.to('teacher:' + r.code).emit('teacher', teacherState(r));
    persistSoon();
  }, 120);
}

/* ───────────── 최종 순위 ───────────── */
function computeRankings(r) {
  const list = [...r.students.values()].map(s => ({ id: s.id, name: s.name, av: s.av ?? 0, w: s.w, l: s.l, d: s.d, ai: s.ai, rate: rate(s), missions: missions(s), score: scoreOf(s), stats: s.stats }));
  list.sort((a, b) => b.score - a.score || b.w - a.w || b.rate - a.rate || a.l - b.l || a.name.localeCompare(b.name, 'ko'));
  list.forEach((p, i) => { const prev = list[i - 1]; p.rank = prev && prev.score === p.score && prev.w === p.w && prev.rate === p.rate && prev.l === p.l ? prev.rank : i + 1; });
  return list;
}
function workbook(r) {
  const rk = r.rankings || computeRankings(r);
  const wb = XLSX.utils.book_new();
  const add = (name, aoa, cols) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = cols.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add('최종 순위', [[`영어 쿼리도 교실 ${r.code} · ${selLabel(r)} · ${r.status === 'ended' ? '최종 결과' : '중간 결과'} · 총점 = 승 ${POINTS.win}점 + 무 ${POINTS.draw}점 + 영어 미션 성공 ${POINTS.mission}점`], [],
    ['순위', '이름', '총점', '승', '패', '무', '승률(%)', 'AI 경기', '영어 미션 성공'], ...rk.map(p => [p.rank, p.name, p.score, p.w, p.l, p.d, p.rate, p.ai, p.missions])], [6, 16, 8, 6, 6, 6, 9, 9, 14]);
  const pct = (a, b) => (a + b) ? Math.round(a / (a + b) * 100) : '';
  add('학습 분석', [['이름', '퀴즈 정답', '퀴즈 오답', '퀴즈 정답률(%)', '말하기 성공', '말하기 실패', '말하기 성공률(%)', '교사 승인', '시간 초과'],
    ...[...r.students.values()].map(s => [s.name, s.stats.quizOk, s.stats.quizNo, pct(s.stats.quizOk, s.stats.quizNo), s.stats.speakOk, s.stats.speakNo, pct(s.stats.speakOk, s.stats.speakNo), s.stats.approved, s.stats.timeouts])], [16, 10, 10, 14, 11, 11, 16, 10, 10]);
  const wrong = [];
  for (const s of r.students.values()) for (const q of Object.values(s.qstats)) if (q.no) wrong.push([s.name, q.mode === 'quiz' ? '5지선다' : '말하기', q.unit ? q.unit + '단원' : '직접 올림', q.text, q.no, q.ok,
    q.mode === 'quiz' ? `${q.answer + 1}번 ${q.options[q.answer]}` : '', q.mode === 'quiz' ? Object.entries(q.picks).map(([i, n]) => `${Number(i) + 1}번(${n}회)`).join(', ') : '']);
  add('오답 분석', [['학생', '유형', '단원', '문제/문장', '틀림·실패', '맞음·성공', '정답', '고른 오답'], ...wrong], [14, 9, 9, 50, 10, 10, 30, 20]);
  add('경기 기록', [['경기', '파랑(선공)', '빨강', '결과', '사유', '행동 수', '경기 시간(초)', '종료 시각'],
    ...r.history.slice().reverse().map(h => [h.no, h.names[0], h.names[1], h.winner === null ? '무승부' : h.names[h.winner] + ' 승', h.reason, h.moves, h.durationSec, new Date(h.endedAt).toLocaleString('ko-KR')])], [6, 14, 14, 18, 22, 9, 12, 22]);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/* ───────────── 저장·복원 (서버를 껐다 켜도 수업 유지) ───────────── */
const stateFile = path.join(STATE_DIR, 'rooms.json');
let persistTimer = null;
function serialize(r) {
  const { teacherSockets, _flushTimer, _lastSec, ...rest } = r;
  return { ...rest, students: [...r.students.values()].map(s => ({ ...s, socket: null })),
    matches: [...r.matches.values()].map(m => ({ ...m, remaining: m.phase === 'ended' ? 0 : (r.paused ? m.remaining : Math.max(0, m.deadline - now())) })) };
}
function persistNow() {
  const data = { version: 2, savedAt: now(), rooms: [...rooms.values()].map(serialize) };
  const tmp = stateFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, stateFile);
}
function persistSoon() { if (persistTimer) return; persistTimer = setTimeout(() => { persistTimer = null; try { persistNow(); } catch (e) { console.error('상태 저장 실패:', e.message); } }, 800); persistTimer.unref?.(); }
function restore() {
  if (!fs.existsSync(stateFile)) return;
  try {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (data.version !== 2) return;
    for (const raw of data.rooms || []) {
      const r = { ...raw, teacherSockets: new Set(), students: new Map(raw.students.map(s => [s.id, { ...s, socket: null, goneAt: now() }])), matches: new Map() };
      for (const m of raw.matches) { m.deadline = now() + (m.remaining || 0); r.matches.set(m.id, m); }
      if (!Array.isArray(r.sel)) r.sel = ['u10'];
      if (!r.wallCount) r.wallCount = 10;
      if (!r.custom) r.custom = { quiz: [], speak: [], name: { quiz: '', speak: '' } };
      delete r.banks; delete r.bankSource;
      if (r.status === 'playing') r.paused = true; // 교사가 '재개'를 눌러야 다시 진행
      rooms.set(r.code, r);
    }
    console.log(`이전 수업 ${rooms.size}개를 복원했습니다. (진행 중이던 수업은 일시정지 상태)`);
  } catch (e) { console.error('수업 복원 실패:', e.message); }
}
function cleanupRooms() {
  for (const r of rooms.values()) {
    const age = now() - (r.endedAt || r.createdAt);
    if ((r.status === 'ended' && age > 12 * 3600e3) || (r.status !== 'ended' && now() - r.createdAt > 24 * 3600e3)) rooms.delete(r.code);
  }
}

/* ───────────── 소켓 ───────────── */
const ok = (cb, data = {}) => cb?.({ ok: true, ...data });
const no = (cb, message) => cb?.({ ok: false, message });
function teacherRoom(socket) { const r = rooms.get(socket.data.teacherCode); return r && r.token === socket.data.teacherToken ? r : null; }
function studentCtx(socket) {
  const r = rooms.get(socket.data.code); if (!r) return {};
  const s = r.students.get(socket.data.sid); if (!s || s.socket !== socket.id) return {};
  return { r, s };
}
function attachStudent(r, s, socket) {
  if (s.socket && s.socket !== socket.id) io.to(s.socket).emit('kicked', { message: '다른 기기에서 같은 이름으로 접속해 이 화면은 연결이 종료되었어요.' });
  s.socket = socket.id; s.goneAt = null;
  socket.data.code = r.code; socket.data.sid = s.id;
  socket.join('room:' + r.code);
  if (r.status === 'playing') {
    const m = s.matchId && r.matches.get(s.matchId);
    if (s.state === 'idle' || (s.state === 'match' && (!m || m.phase === 'ended'))) enqueue(s);
  }
}

io.on('connection', socket => {
  socket.on('teacher:create', ({ mode, pin, units } = {}, cb) => {
    if (process.env.TEACHER_PIN && String(pin || '') !== process.env.TEACHER_PIN) return no(cb, '교사 PIN이 맞지 않습니다.');
    const r = createRoom(mode, units);
    socket.data.teacherCode = r.code; socket.data.teacherToken = r.token; socket.join('teacher:' + r.code); socket.join('room:' + r.code);
    ok(cb, { code: r.code, token: r.token }); flush(r);
  });
  socket.on('teacher:resume', ({ code, token } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.token !== token) return no(cb, '교실 정보를 찾을 수 없습니다.');
    socket.data.teacherCode = r.code; socket.data.teacherToken = r.token; socket.join('teacher:' + r.code); socket.join('room:' + r.code);
    ok(cb, { code: r.code }); flush(r);
  });
  socket.on('teacher:mode', ({ mode } = {}, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    if (!['quiz', 'speak'].includes(mode)) return no(cb, '잘못된 모드');
    if (r.status === 'ended') return no(cb, '끝난 수업입니다.');
    r.mode = mode;
    repickWaiting(r); // 문제를 풀기 전 단계의 경기는 새 모드의 문제로 바로 교체
    ok(cb); flush(r);
  });
  socket.on('teacher:turnSec', ({ sec } = {}, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    const v = Number(sec); if (![30, 45, 60, 90, 120, 180].includes(v)) return no(cb, '잘못된 시간');
    r.turnSec = v; ok(cb); flush(r);
  });
  socket.on('teacher:walls', ({ n } = {}, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    const v = Number(n); if (!Number.isInteger(v) || v < 5 || v > 10) return no(cb, '벽은 5~10개 중에서 고를 수 있어요.');
    r.wallCount = v; ok(cb); flush(r);
  });
  socket.on('teacher:units', ({ sel } = {}, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    if (r.status === 'ended') return no(cb, '끝난 수업입니다.');
    const v = [...new Set((Array.isArray(sel) ? sel : []).filter(x => SOURCES.includes(x)))];
    if (!v.length) return no(cb, '단원을 하나 이상 골라 주세요.');
    if (v.includes('custom') && !r.custom.quiz.length && !r.custom.speak.length) return no(cb, '아직 올린 문제가 없어요. 아래에서 엑셀 파일을 먼저 올려 주세요.');
    r.sel = v; repickWaiting(r);
    ok(cb, { label: selLabel(r) }); flush(r);
  });
  socket.on('teacher:resetBank', ({ kind } = {}, cb) => {
    const r = teacherRoom(socket); if (!r || !['quiz', 'speak'].includes(kind)) return no(cb, '교사 권한이 없습니다.');
    r.custom[kind] = []; r.custom.name[kind] = '';
    if (!r.custom.quiz.length && !r.custom.speak.length) { r.sel = r.sel.filter(x => x !== 'custom'); if (!r.sel.length) r.sel = ['u10']; }
    repickWaiting(r); ok(cb); flush(r);
  });
  socket.on('teacher:start', (_d, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    if (r.status !== 'lobby') return no(cb, '이미 시작했습니다.');
    const ready = [...r.students.values()].filter(online);
    if (!ready.length) return no(cb, '입장한 학생이 없습니다.');
    r.status = 'playing'; r.startedAt = now(); r.paused = false;
    for (const s of ready) enqueue(s);
    matchmake(r, { kickoff: true });
    ok(cb); flush(r);
  });
  socket.on('teacher:pause', (_d, cb) => {
    const r = teacherRoom(socket); if (!r || r.status !== 'playing') return no(cb, '진행 중인 수업이 아닙니다.');
    const t = now();
    r.paused = !r.paused;
    for (const m of r.matches.values()) {
      if (m.phase === 'ended') continue;
      if (r.paused) m.remaining = Math.max(1000, m.deadline - t);
      else { m.deadline = t + m.remaining; if (m.phase === 'ai') m.aiAt = t + AI_DELAY_MS; }
    }
    if (!r.paused) for (const s of r.students.values()) {
      if (!online(s)) s.goneAt = t;           // 끊긴 학생은 재개 후 다시 유예 시간
      if (s.state === 'result') s.resultUntil = t + 3000;
      if (s.state === 'queue') s.since = t - 1500;
    }
    ok(cb, { paused: r.paused }); flush(r);
  });
  socket.on('teacher:end', (_d, cb) => {
    const r = teacherRoom(socket); if (!r || r.status === 'ended') return no(cb, '종료할 수 없습니다.');
    for (const m of r.matches.values()) if (m.phase !== 'ended') endMatch(r, m, null, '수업 종료로 중단', { abort: true });
    r.status = 'ended'; r.paused = false; r.endedAt = now();
    for (const s of r.students.values()) { s.state = 'done'; s.matchId = null; }
    r.rankings = computeRankings(r);
    try {
      fs.writeFileSync(path.join(RESULTS_DIR, `quoridor-${r.code}-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({ room: r.code, endedAt: new Date().toISOString(), rankings: r.rankings, history: r.history.map(({ board, ...h }) => h) }, null, 2));
    } catch (e) { console.error('결과 파일 저장 실패:', e.message); }
    ok(cb); flush(r); try { persistNow(); } catch (_e) { }
  });
  socket.on('teacher:approve', ({ matchId } = {}, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    const m = r.matches.get(String(matchId || ''));
    if (!m || m.phase !== 'question' || r.paused) return no(cb, '지금은 승인할 수 없습니다.');
    const s = r.students.get(m.ids[m.board.turn]); if (!s) return no(cb, '학생을 찾을 수 없습니다.');
    m.phase = 'action'; m.help = false; s.stats.approved++;
    m.last = { who: m.board.turn, kind: 'approve', mode: m.q.mode, success: true, text: m.q.text, at: now() };
    ok(cb, { name: s.name }); flush(r);
  });
  socket.on('teacher:remove', ({ sid } = {}, cb) => {
    const r = teacherRoom(socket); if (!r) return no(cb, '교사 권한이 없습니다.');
    const s = r.students.get(String(sid || '')); if (!s) return no(cb, '학생을 찾을 수 없습니다.');
    const m = s.matchId && r.matches.get(s.matchId);
    if (m && m.phase !== 'ended') {
      endMatch(r, m, null, '상대가 나감', { abort: true });
      for (const x of m.ids) { const o = r.students.get(x); if (o && o !== s) { o.state = 'result'; o.resultUntil = now() + 2500; } }
    }
    if (s.socket) { io.to(s.socket).emit('kicked', { message: '선생님이 교실에서 내보냈어요.' }); io.sockets.sockets.get(s.socket)?.leave('room:' + r.code); }
    r.students.delete(s.id);
    ok(cb); flush(r);
  });

  socket.on('student:join', ({ code, name, av } = {}, cb) => {
    const avatar = [0, 1, 2, 3].includes(Number(av)) ? Number(av) : 0;
    const r = rooms.get(String(code || '').trim().toUpperCase());
    if (!r) return no(cb, '방 코드를 다시 확인해 주세요.');
    if (r.status === 'ended') return no(cb, '이미 끝난 수업입니다.');
    const nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nm) return no(cb, '이름을 입력해 주세요.');
    const same = [...r.students.values()].find(s => s.name.replace(/\s/g, '') === nm.replace(/\s/g, ''));
    let s;
    if (same) {
      if (online(same)) return no(cb, '같은 이름이 이미 접속해 있어요. 번호를 붙여 입력해 주세요. (예: 김하늘2)');
      s = same; s.token = rid(16); s.av = avatar; // 연결이 끊겼던 학생은 이름으로 다시 들어와 기록을 이어감
    } else {
      if (r.students.size >= MAX_STUDENTS) return no(cb, `최대 ${MAX_STUDENTS}명까지 입장할 수 있어요.`);
      s = newStudent(nm, avatar); r.students.set(s.id, s);
    }
    attachStudent(r, s, socket);
    ok(cb, { code: r.code, sid: s.id, token: s.token, name: s.name, av: s.av, rejoined: !!same }); flush(r);
  });
  socket.on('student:resume', ({ code, sid, token } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    const s = r?.students.get(String(sid || ''));
    if (!r || !s || s.token !== token) return no(cb, '다시 입장해 주세요.');
    if (r.status === 'ended') { socket.join('room:' + r.code); ok(cb, { code: r.code, sid: s.id, token: s.token, name: s.name }); socket.emit('pub', publicState(r)); return; }
    attachStudent(r, s, socket);
    ok(cb, { code: r.code, sid: s.id, token: s.token, name: s.name }); flush(r);
  });

  function myMatch(cb) {
    const { r, s } = studentCtx(socket);
    if (!r) { no(cb, '교실 연결이 끊겼어요. 새로고침해 주세요.'); return {}; }
    if (r.status !== 'playing') { no(cb, '진행 중인 수업이 아닙니다.'); return {}; }
    if (r.paused) { no(cb, '선생님이 잠시 멈췄어요.'); return {}; }
    const m = s.matchId && r.matches.get(s.matchId);
    if (!m || m.phase === 'ended') { no(cb, '진행 중인 경기가 없어요.'); return {}; }
    const who = m.ids.indexOf(s.id);
    if (m.board.turn !== who) { no(cb, '지금은 상대 차례예요.'); return {}; }
    return { r, s, m, who };
  }
  socket.on('game:quiz', ({ choice } = {}, cb) => {
    const { r, s, m, who } = myMatch(cb); if (!m) return;
    if (m.phase !== 'question' || m.q.mode !== 'quiz') return no(cb, '지금은 문제를 풀 단계가 아니에요.');
    const c = Number(choice); if (!Number.isInteger(c) || c < 0 || c > 4) return no(cb, '보기를 골라 주세요.');
    const success = c === m.q.answer, q = m.q;
    recordQuestion(s, q, success, c);
    if (success) { s.stats.quizOk++; m.side[who].ok++; m.phase = 'action'; }
    else { s.stats.quizNo++; m.side[who].no++; }
    m.last = { who, kind: 'quiz', success, text: q.text, choice: c, answer: q.answer, answerText: q.options[q.answer], at: now() };
    ok(cb, { success, answer: q.answer });
    if (!success) passTurn(r, m); // 틀리면 차례가 상대에게 넘어감
    flush(r);
  });
  socket.on('game:speak', ({ alternatives } = {}, cb) => {
    const { r, s, m, who } = myMatch(cb); if (!m) return;
    if (m.phase !== 'question' || m.q.mode !== 'speak') return no(cb, '지금은 말하기 단계가 아니에요.');
    const res = speech.evaluate(m.q.text, alternatives);
    const q = m.q;
    recordQuestion(s, q, res.success);
    m.attempts++;
    if (res.success) { s.stats.speakOk++; m.side[who].ok++; m.phase = 'action'; m.help = false; }
    else { s.stats.speakNo++; m.side[who].no++; }
    m.last = { who, kind: 'speak', success: res.success, text: q.text, score: res.score, attempt: m.attempts, at: now() };
    ok(cb, { success: res.success, score: res.score, heard: res.heard, attempts: m.attempts, pass: res.pass });
    if (!res.success && m.attempts >= 2) passTurn(r, m); // 2번 모두 실패하면 차례 넘김
    flush(r);
  });
  socket.on('game:help', (_d, cb) => {
    const { r, m } = myMatch(cb); if (!m) return;
    if (m.phase !== 'question') return no(cb, '도움 요청은 미션 단계에서만 할 수 있어요.');
    m.help = true; ok(cb); flush(r);
  });
  socket.on('game:action', ({ kind, r: row, c, o } = {}, cb) => {
    const { r, m, who } = myMatch(cb); if (!m) return;
    if (m.phase !== 'action') return no(cb, '먼저 영어 미션을 통과해 주세요.');
    const R = Number(row), C = Number(c);
    let valid = false, reason = '갈 수 없는 칸이에요.';
    if (kind === 'move') valid = E.move(m.board, who, R, C);
    else if (kind === 'wall') { const chk = E.checkWall(m.board, who, R, C, o); reason = chk.reason; valid = chk.ok && E.place(m.board, who, R, C, o); }
    if (!valid) return no(cb, reason);
    m.last = { who, kind, at: now() };
    ok(cb); afterAction(r, m); flush(r);
  });
  socket.on('disconnect', () => {
    const { r, s } = studentCtx(socket);
    if (r && s) { s.socket = null; s.goneAt = now(); flush(r); }
  });
});

/* ───────────── HTTP API ───────────── */
function teacherAuth(req, res) {
  const r = rooms.get(String(req.params.code || '').toUpperCase());
  const token = req.headers['x-teacher-token'] || req.query.token;
  if (!r || token !== r.token) { res.status(403).json({ error: '교사 인증에 실패했습니다.' }); return null; }
  return r;
}
app.post('/api/rooms/:code/upload', (req, res, next) => upload.single('file')(req, res, err => err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '파일이 너무 큽니다(최대 5MB).' : '업로드 실패' }) : next()), (req, res) => {
  const r = teacherAuth(req, res); if (!r) return;
  const kind = req.query.kind === 'speak' ? 'speak' : 'quiz';
  try {
    if (!req.file) throw new Error('파일이 없습니다.');
    const items = Q.parseBank(req.file.buffer, kind);
    r.custom[kind] = items; r.custom.name[kind] = String(req.file.originalname || '업로드 파일').slice(0, 60);
    if (!r.sel.includes('custom')) r.sel = ['custom']; // 올리면 '직접 올린 문제'로 바로 전환(단원은 다시 함께 켤 수 있음)
    repickWaiting(r); flush(r);
    res.json({ ok: true, count: items.length, kind });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/template/:kind.xlsx', (req, res) => {
  const kind = req.params.kind === 'speak' ? 'speak' : 'quiz';
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(kind === 'speak' ? '말하기_문장_양식.xlsx' : '5지선다_문제_양식.xlsx')}`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Q.templateBuffer(kind));
});
app.get('/api/rooms/:code/export.xlsx', (req, res) => {
  const r = teacherAuth(req, res); if (!r) return;
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`영어쿼리도_${r.code}_${r.status === 'ended' ? '최종결과' : '중간결과'}.xlsx`)}`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(workbook(r));
});
app.get('/api/rooms/:code/analysis', (req, res) => {
  const r = teacherAuth(req, res); if (!r) return;
  const agg = new Map();
  const students = [...r.students.values()].map(s => ({ id: s.id, name: s.name, items: Object.values(s.qstats).filter(q => q.no).sort((a, b) => b.no - a.no).slice(0, 50) }));
  for (const s of r.students.values()) for (const q of Object.values(s.qstats)) {
    const e = agg.get(q.key) || { key: q.key, mode: q.mode, unit: q.unit, text: q.text, options: q.options, answer: q.answer, ok: 0, no: 0, students: 0 };
    e.ok += q.ok; e.no += q.no; if (q.no) e.students++; agg.set(q.key, e);
  }
  res.json({ students, weak: [...agg.values()].filter(e => e.no).sort((a, b) => b.students - a.students || b.no - a.no).slice(0, 30) });
});
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}
app.get('/api/info', (_req, res) => {
  // 인터넷 서버(Render 등)에 올린 경우: 그 주소를 학생 접속 주소로 안내
  const pubUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (pubUrl) return res.json({ ips: [], port: PORT, httpsPort: null, studentUrl: pubUrl });
  const ips = lanAddresses();
  res.json({ ips, port: PORT, httpsPort: USE_HTTPS && servers.length > 1 ? HTTPS_PORT : null,
    studentUrl: ips[0] ? (USE_HTTPS && servers.length > 1 ? `https://${ips[0]}:${HTTPS_PORT}` : `http://${ips[0]}:${PORT}`) : null });
});
app.get('/api/qr.svg', async (req, res) => {
  try { const QR = require('qrcode'); res.type('image/svg+xml').send(await QR.toString(String(req.query.text || '').slice(0, 300), { type: 'svg', margin: 1 })); }
  catch (_e) { res.status(404).end(); }
});
app.get('/api/samples', (_q, res) => res.json({ units: UNIT_IDS.map(id => ({ id, ...UNITS[id] })) }));
app.post('/api/speech-check', (req, res) => { const r = speech.evaluate(String(req.body?.text || '').slice(0, 200), req.body?.alternatives); res.json({ success: r.success, score: r.score, heard: r.heard }); });
app.get('/api/rooms/:code/ranking', (req, res) => {
  const r = rooms.get(String(req.params.code || '').toUpperCase());
  if (!r) return res.status(404).json({ error: '방 코드를 찾을 수 없어요.' });
  const list = (r.rankings || computeRankings(r)).map(({ id, rank, name, av, w, l, d, rate, score }) => ({ id, rank, name, av, w, l, d, rate, score }));
  res.json({ ended: r.status === 'ended', list });
});
app.get('/api/health', (_q, res) => res.json({ ok: true, rooms: rooms.size }));

/* ───────────── HTTPS(태블릿 마이크용) ───────────── */
function httpsOptions() {
  const dir = path.join(DATA_DIR, 'cert'), keyF = path.join(dir, 'key.pem'), certF = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyF) && fs.existsSync(certF)) return { key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) };
  try {
    const selfsigned = require('selfsigned');
    const alt = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...lanAddresses().map(ip => ({ type: 7, ip }))];
    const pems = selfsigned.generate([{ name: 'commonName', value: 'english-quoridor.local' }], { days: 3650, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: alt }] });
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(keyF, pems.private); fs.writeFileSync(certF, pems.cert);
    return { key: pems.private, cert: pems.cert };
  } catch (e) { console.warn('HTTPS 인증서를 만들지 못했습니다(말하기 모드는 태블릿에서 제한될 수 있음):', e.message); return null; }
}

/* ───────────── 시작 ───────────── */
restore();
let ticker = null;
function startTicker() { ticker = setInterval(() => { for (const r of rooms.values()) { try { tick(r); } catch (e) { console.error('tick 오류', e); } } }, 250); }
setInterval(cleanupRooms, 10 * 60e3).unref();

function listen() {
  if (USE_HTTPS) { const opt = httpsOptions(); if (opt) servers.push(https.createServer(opt, app)); }
  servers.forEach(s => io.attach(s));
  servers[0].listen(PORT, () => {
    const ips = lanAddresses();
    console.log('\n🎲 영어 쿼리도 교실 서버가 켜졌습니다.');
    console.log(`  교사(이 컴퓨터): http://localhost:${PORT}`);
    if (servers[1]) { servers[1].listen(HTTPS_PORT); ips.forEach(ip => console.log(`  학생(태블릿·마이크 가능): https://${ip}:${HTTPS_PORT}`)); }
    else ips.forEach(ip => console.log(`  학생: http://${ip}:${PORT}`));
    console.log('');
  });
  startTicker();
}
function shutdown() { try { persistNow(); } catch (e) { console.error(e); } process.exit(0); }
if (require.main === module) { listen(); process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); }

module.exports = { app, io, rooms, servers, listen, tick, matchmake, computeRankings, persistNow, startTicker, stop: () => { clearInterval(ticker); servers.forEach(s => s.close()); io.close(); } };
