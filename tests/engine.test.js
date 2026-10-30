const assert = require('node:assert/strict');
const E = require('../engine');
let b = E.initial();
assert.deepEqual(E.legalMoves(b, 0).map(String).sort(), ['7,4', '8,3', '8,5']);
assert.ok(E.move(b, 0, 7, 4)); assert.equal(b.turn, 1);
assert.ok(!E.move(b, 0, 6, 4), '상대 차례에 움직일 수 없음');
// 벽: 겹침·교차 금지
b = E.initial();
assert.ok(E.place(b, 0, 3, 3, 'h'));
assert.ok(!E.checkWall(b, 1, 3, 3, 'v').ok, '교차 금지');
assert.ok(!E.checkWall(b, 1, 3, 4, 'h').ok, '겹침 금지');
assert.ok(E.checkWall(b, 1, 3, 5, 'h').ok, '이어 붙이기는 가능');
// 길 완전 봉쇄 금지: 7행 아래를 0~7열 가로벽으로 막고, 8열 통로도 막으려 하면 거부
const wall = E.initial(); wall.walls = [0, 2, 4, 6].map(c => ({ r: 6, c, o: 'h' })); wall.p = [[8, 4], [0, 4]];
assert.ok(E.distance(wall, 0) < Infinity);
assert.equal(E.checkWall(wall, 0, 7, 7, 'v').ok, false, '마지막 통로를 막는 벽은 거부');
assert.equal(E.checkWall(wall, 0, 4, 0, 'v').ok, true);
// 점프
b = E.initial(); b.p = [[5, 4], [4, 4]];
assert.ok(E.legalMoves(b, 0).some(m => m[0] === 3 && m[1] === 4), '정면 점프');
b.walls = [{ r: 3, c: 4, o: 'h' }];
const lm = E.legalMoves(b, 0).map(String);
assert.ok(lm.includes('4,3') && lm.includes('4,5') && !lm.includes('3,4'), '뒤가 막히면 대각선');
// 승리
b = E.initial(); b.p = [[1, 4], [7, 0]];
assert.ok(E.move(b, 0, 0, 4)); assert.equal(b.winner, 0);
// AI는 항상 합법 수를 둔다
for (let g = 0; g < 30; g++) {
  const x = E.initial(); let n = 0;
  while (x.winner === null && n < 300) { const a = E.aiAction(x); const who = x.turn; const ok = a.kind === 'move' ? E.move(x, who, a.r, a.c) : E.place(x, who, a.r, a.c, a.o); assert.ok(ok, 'AI 합법 수'); n++; }
  assert.ok(x.winner !== null, 'AI끼리 대결이 끝남');
}
{ const w = E.initial(5); assert.deepEqual(w.left, [5, 5]); w.left = [0, 5]; assert.equal(E.checkWall(w, 0, 3, 3, 'h').ok, false, '벽을 다 쓰면 설치 불가'); }
console.log('✓ engine: 이동·점프·대각선·벽 겹침/교차/봉쇄 금지·승리·AI 합법 수');
