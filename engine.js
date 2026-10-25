/* English Quoridor — 쿼리도 규칙 엔진 (서버·브라우저 공용)
   좌표: r(행 0~8, 0이 위쪽), c(열 0~8). 플레이어 0은 아래(8행)에서 출발해 0행 도착, 플레이어 1은 반대.
   벽 {r,c,o}: r,c는 0~7의 교차점. o='h' 가로벽은 r행과 r+1행 사이(c, c+1열), o='v' 세로벽은 c열과 c+1열 사이(r, r+1행). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const N = 9, WALLS = 10;
  const GOAL = [0, 8];

  function initial() {
    return { p: [[8, 4], [0, 4]], walls: [], left: [WALLS, WALLS], turn: 0, moves: 0, winner: null };
  }
  function clone(b) {
    return { p: b.p.map(x => [...x]), walls: b.walls.map(w => ({ ...w })), left: [...b.left], turn: b.turn, moves: b.moves, winner: b.winner };
  }
  function blockedSet(walls) {
    const s = new Set();
    for (const { r, c, o } of walls) {
      if (o === 'h') { s.add(`${r},${c}|${r + 1},${c}`); s.add(`${r},${c + 1}|${r + 1},${c + 1}`); }
      else { s.add(`${r},${c}|${r},${c + 1}`); s.add(`${r + 1},${c}|${r + 1},${c + 1}`); }
    }
    return s;
  }
  function edgeKey(a, b) {
    return (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) ? `${a[0]},${a[1]}|${b[0]},${b[1]}` : `${b[0]},${b[1]}|${a[0]},${a[1]}`;
  }
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  function steps(blocked, p) {
    const out = [];
    for (const [dr, dc] of DIRS) {
      const q = [p[0] + dr, p[1] + dc];
      if (q[0] < 0 || q[0] >= N || q[1] < 0 || q[1] >= N) continue;
      if (blocked.has(edgeKey(p, q))) continue;
      out.push(q);
    }
    return out;
  }
  /** 현재 플레이어가 갈 수 있는 칸(점프·대각선 포함) */
  function legalMoves(b, who = b.turn) {
    const blocked = blockedSet(b.walls), me = b.p[who], other = b.p[1 - who], res = [];
    for (const q of steps(blocked, me)) {
      if (q[0] !== other[0] || q[1] !== other[1]) { res.push(q); continue; }
      const dr = other[0] - me[0], dc = other[1] - me[1];
      const ahead = [other[0] + dr, other[1] + dc];
      const around = steps(blocked, other);
      if (around.some(v => v[0] === ahead[0] && v[1] === ahead[1])) res.push(ahead);
      else for (const v of around) if (v[0] !== me[0] || v[1] !== me[1]) res.push(v);
    }
    return res;
  }
  /** 목표 줄까지 최단 거리(상대 말은 무시). 길이 없으면 Infinity */
  function distance(b, who, blocked) {
    blocked = blocked || blockedSet(b.walls);
    const goal = GOAL[who], start = b.p[who];
    const seen = new Uint8Array(81), q = [[start[0], start[1], 0]];
    seen[start[0] * 9 + start[1]] = 1;
    for (let i = 0; i < q.length; i++) {
      const [r, c, d] = q[i];
      if (r === goal) return d;
      for (const n of steps(blocked, [r, c])) {
        const k = n[0] * 9 + n[1];
        if (!seen[k]) { seen[k] = 1; q.push([n[0], n[1], d + 1]); }
      }
    }
    return Infinity;
  }
  /** 벽 설치 가능 여부와 이유 */
  function checkWall(b, who, r, c, o) {
    if (b.winner !== null) return { ok: false, reason: '경기가 끝났습니다.' };
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 7 || c < 0 || c > 7 || (o !== 'h' && o !== 'v')) return { ok: false, reason: '벽을 놓을 수 없는 위치입니다.' };
    if (b.left[who] < 1) return { ok: false, reason: '남은 벽이 없습니다.' };
    for (const w of b.walls) {
      if (w.r === r && w.c === c) return { ok: false, reason: '다른 벽과 겹치거나 교차합니다.' };
      if (w.o === o) {
        if (o === 'h' && w.r === r && Math.abs(w.c - c) < 2) return { ok: false, reason: '다른 벽과 겹칩니다.' };
        if (o === 'v' && w.c === c && Math.abs(w.r - r) < 2) return { ok: false, reason: '다른 벽과 겹칩니다.' };
      }
    }
    const walls = [...b.walls, { r, c, o }], blocked = blockedSet(walls);
    if (distance(b, 0, blocked) === Infinity || distance(b, 1, blocked) === Infinity) return { ok: false, reason: '길을 완전히 막을 수는 없어요.' };
    return { ok: true };
  }
  function place(b, who, r, c, o) {
    if (b.turn !== who) return false;
    if (!checkWall(b, who, r, c, o).ok) return false;
    b.walls.push({ r, c, o }); b.left[who]--; b.moves++; b.turn = 1 - who;
    return true;
  }
  function move(b, who, r, c) {
    if (b.winner !== null || b.turn !== who) return false;
    if (!legalMoves(b, who).some(v => v[0] === r && v[1] === c)) return false;
    b.p[who] = [r, c]; b.moves++;
    if (r === GOAL[who]) b.winner = who; else b.turn = 1 - who;
    return true;
  }
  /** 차례만 넘김(오답·시간 초과) */
  function skip(b) { if (b.winner === null) { b.moves++; b.turn = 1 - b.turn; } }

  /** 초등학생 상대용 AI: 최단 경로로 이동, 상대가 앞서면 가끔 효과적인 벽 설치 */
  function aiAction(b, rnd = Math.random) {
    const who = b.turn, opp = 1 - who;
    const blocked = blockedSet(b.walls);
    const myD = distance(b, who, blocked), oppD = distance(b, opp, blocked);
    // 이동 후보
    let best = null, bestScore = -Infinity;
    for (const m of legalMoves(b, who)) {
      const t = clone(b); t.p[who] = m;
      const d = m[0] === GOAL[who] ? 0 : distance(t, who, blocked);
      const s = -d * 10 + rnd() * 0.5;
      if (s > bestScore) { bestScore = s; best = { kind: 'move', r: m[0], c: m[1] }; }
    }
    const behind = oppD < myD || oppD <= 2;
    if (b.left[who] > 0 && behind && rnd() < 0.55) {
      let wBest = null, wScore = 0;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (const o of ['h', 'v']) {
        if (!checkWall(b, who, r, c, o).ok) continue;
        const walls = [...b.walls, { r, c, o }], bl = blockedSet(walls);
        const gain = (distance(b, opp, bl) - oppD) - (distance(b, who, bl) - myD) * 1.2 + rnd() * 0.3;
        if (gain > wScore) { wScore = gain; wBest = { kind: 'wall', r, c, o }; }
      }
      if (wBest && wScore >= 1.5) return wBest;
    }
    return best;
  }
  return { N, WALLS, GOAL, initial, clone, legalMoves, distance, checkWall, place, move, skip, aiAction };
});
