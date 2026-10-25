/* 쿼리도 판 그리기 — 정확한 9×9 게임판 그림(ui/board.png) 위에 말·벽 그림만 올림(판 위 글씨 없음)
   판 그림: 위쪽 빨간 줄 = 빨강 출발선(파랑의 목표), 아래쪽 파란 줄 = 파랑 출발선(빨강의 목표) */
(function () {
  const IMG = {}, loaded = [];
  for (const k of ['board', 'pawn_blue', 'pawn_red', 'wall_h', 'wall_v', 'sq_blue', 'sq_green', 'sq_red']) {
    const im = new Image(); im.src = '/assets/ui/' + k + '.png';
    im.onload = () => loaded.forEach(fn => fn()); IMG[k] = im;
  }
  const ready = im => im && im.complete && im.naturalWidth > 0;
  const PAD = 83.6 / 1260; // 판 그림 테두리 비율(측정값)
  function geom(S) { const pad = S * PAD, cell = (S - pad * 2) / 9; return { pad, cell }; }

  function wall(ctx, x, y, cell, vertical, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(40,18,4,.45)'; ctx.shadowBlur = cell * .12; ctx.shadowOffsetY = cell * .05;
    const len = cell * 1.96, th = cell * .32;
    const im = vertical ? IMG.wall_v : IMG.wall_h;
    if (ready(im)) { if (vertical) ctx.drawImage(im, x - th / 2, y - len / 2, th, len); else ctx.drawImage(im, x - len / 2, y - th / 2, len, th); }
    else { ctx.fillStyle = '#8c5126'; if (vertical) ctx.fillRect(x - th / 3, y - len / 2, th / 1.5, len); else ctx.fillRect(x - len / 2, y - th / 3, len, th / 1.5); }
    ctx.restore();
  }
  function pawn(ctx, im, cx, cy, cell, fallback) {
    const h = cell * 1.08, w = ready(im) ? h * im.naturalWidth / im.naturalHeight : h * .6;
    const baseY = cy + cell * .36;
    ctx.save();
    ctx.fillStyle = 'rgba(30,14,4,.32)'; ctx.beginPath(); ctx.ellipse(cx, baseY - cell * .02, w * .46, cell * .1, 0, 0, Math.PI * 2); ctx.fill();
    if (ready(im)) ctx.drawImage(im, cx - w / 2, baseY - h, w, h);
    else { ctx.fillStyle = fallback; ctx.beginPath(); ctx.arc(cx, cy, cell * .3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /** opts: flip(내 말이 아래쪽에 보이게 180° 회전), colors([p0,p1]='blue'|'red'), moves, preview({r,c,o,ok}), turn */
  function draw(canvas, board, opts = {}) {
    if (!canvas || !board) return;
    const ctx = canvas.getContext('2d'), S = canvas.width, { pad, cell } = geom(S);
    const flip = !!opts.flip, colors = opts.colors || ['blue', 'red'];
    const vc = (r, c) => flip ? [8 - r, 8 - c] : [r, c];
    const vw = (r, c) => flip ? [7 - r, 7 - c] : [r, c];
    ctx.clearRect(0, 0, S, S);
    if (ready(IMG.board)) ctx.drawImage(IMG.board, 0, 0, S, S);
    else { ctx.fillStyle = '#6a3a18'; ctx.fillRect(0, 0, S, S); for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { ctx.fillStyle = r === 0 ? '#f5c2c2' : r === 8 ? '#a9cdf8' : (r + c) % 2 ? '#dca55a' : '#cf914b'; ctx.fillRect(pad + c * cell + 3, pad + r * cell + 3, cell - 6, cell - 6); } }
    for (const m of opts.moves || []) {
      const [r, c] = vc(m[0], m[1]);
      if (ready(IMG.sq_blue)) ctx.drawImage(IMG.sq_blue, pad + c * cell - cell * .04, pad + r * cell - cell * .04, cell * 1.08, cell * 1.08);
      else { ctx.fillStyle = 'rgba(60,140,255,.45)'; ctx.fillRect(pad + c * cell + 4, pad + r * cell + 4, cell - 8, cell - 8); }
    }
    for (const w of board.walls || []) { const [r, c] = vw(w.r, w.c); wall(ctx, pad + (c + 1) * cell, pad + (r + 1) * cell, cell, w.o === 'v'); }
    if (opts.preview) {
      const p = opts.preview, [r, c] = vw(p.r, p.c), x = pad + (c + 1) * cell, y = pad + (r + 1) * cell, v = p.o === 'v';
      const L = cell * 2.1, T = cell * .5;
      ctx.save(); ctx.lineWidth = cell * .07; ctx.strokeStyle = p.ok ? '#19c25a' : '#e8323c'; ctx.fillStyle = p.ok ? 'rgba(40,210,100,.28)' : 'rgba(235,50,60,.32)';
      ctx.shadowColor = p.ok ? 'rgba(30,220,100,.9)' : 'rgba(255,40,60,.9)'; ctx.shadowBlur = cell * .25;
      if (v) roundRect(ctx, x - T / 2, y - L / 2, T, L, T * .3); else roundRect(ctx, x - L / 2, y - T / 2, L, T, T * .3);
      ctx.fill(); ctx.stroke(); ctx.restore();
      if (p.ok) wall(ctx, x, y, cell, v, .8);
      else if (ready(IMG.sq_red)) ctx.drawImage(IMG.sq_red, x - cell * .32, y - cell * .32, cell * .64, cell * .64);
    }
    const order = [0, 1].sort((a, b) => vc(...board.p[a])[0] - vc(...board.p[b])[0]);
    for (const who of order) {
      const [r, c] = vc(board.p[who][0], board.p[who][1]);
      const cx = pad + (c + .5) * cell, cy = pad + (r + .5) * cell;
      if (opts.turn === who && board.winner === null) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,214,70,.95)'; ctx.lineWidth = cell * .07; ctx.shadowColor = 'rgba(255,200,40,.9)'; ctx.shadowBlur = cell * .2;
        ctx.beginPath(); ctx.ellipse(cx, cy + cell * .33, cell * .38, cell * .14, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      pawn(ctx, IMG[colors[who] === 'blue' ? 'pawn_blue' : 'pawn_red'], cx, cy, cell, colors[who] === 'blue' ? '#2a62c9' : '#d3343a');
    }
  }
  /** 화면 터치 위치 → 칸 또는 벽 위치(게임 좌표) */
  function hit(canvas, ev, mode, orient, flip) {
    const bb = canvas.getBoundingClientRect(), S = canvas.width, { pad, cell } = geom(S);
    const x = (ev.clientX - bb.left) / bb.width * S, y = (ev.clientY - bb.top) / bb.height * S;
    const gx = (x - pad) / cell, gy = (y - pad) / cell;
    if (mode === 'move') {
      let r = Math.floor(gy), c = Math.floor(gx);
      if (r < 0 || r > 8 || c < 0 || c > 8) return null;
      if (flip) { r = 8 - r; c = 8 - c; }
      return { kind: 'move', r, c };
    }
    if (gx < -0.3 || gy < -0.3 || gx > 9.3 || gy > 9.3) return null;
    const clamp = v => Math.max(0, Math.min(7, v));
    let r, c;
    if (orient === 'h') { r = clamp(Math.round(gy) - 1); c = clamp(Math.floor(gx - .5)); }
    else { c = clamp(Math.round(gx) - 1); r = clamp(Math.floor(gy - .5)); }
    if (flip) { r = 7 - r; c = 7 - c; }
    return { kind: 'wall', r, c, o: orient };
  }
  window.QBoard = { draw, hit, onLoad: fn => loaded.push(fn), IMG };
})();
