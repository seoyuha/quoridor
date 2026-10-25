/* 영어 쿼리도 — 첫 화면 · 학생 · 교사 화면 */
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const socket = io({ transports: ['websocket', 'polling'] });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const KEYS = 'ABCDE', UI = '/assets/ui/';
  const MODE = { quiz: '📄 문제 풀기', speak: '🎤 말하기' };
  const AVS = ['boy', 'girl', 'glasses', 'band'];
  const UNIT_META = { u10: { no: 10, em: '🍝', topic: '음식 주문 · 맛 표현' }, u11: { no: 11, em: '🏮', topic: '전통문화 · 권유하기' }, u12: { no: 12, em: '🌍', topic: '환경 보호 · 의무 말하기' } };
  const unitTag = n => n ? `<span class="qunit u${n}">${n}단원</span>` : '';
  const avSrc = av => UI + 'av_' + (av === 'ai' ? 'ai' : AVS[av] || 'boy') + '.png';
  const avImg = (av, cls = '') => `<img class="av ${cls}" src="${avSrc(av)}" alt="">`;
  const qp = new URLSearchParams(location.search);
  let role = null, pub = null, me = null, ts = null, info = null;
  let tool = 'move', orient = 'h', preview = null, missionKey = '', holdUntil = 0, resultShownFor = null;
  const speakLog = {}; let rec = null, recLive = false, interim = '';

  /* ── 공통 도구 ── */
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
  function show(v) { $$('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v)); }
  function pane(p) { $$('#v-student .pane').forEach(x => x.classList.toggle('on', x.id === 'p-' + p)); }
  const recTxt = p => `${p.w}승 ${p.l}패${p.d ? ` ${p.d}무` : ''} · 승률 ${p.rate}%`;
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}분 ${String(s % 60).padStart(2, '0')}초`;
  const rateCls = r => r >= 70 ? 'rate-hi' : r >= 40 ? 'rate-mid' : 'rate-lo';
  function seg(el, value, onPick) { el.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === value); if (onPick) b.onclick = () => onPick(b.dataset.v); }); }
  function emit(ev, data) { return new Promise(res => socket.emit(ev, data, r => res(r || { ok: false, message: '응답 없음' }))); }
  const store = {
    get(k, local) { try { return JSON.parse((local ? localStorage : sessionStorage).getItem(k) || 'null'); } catch (_e) { return null; } },
    set(k, v, local) { try { (local ? localStorage : sessionStorage).setItem(k, JSON.stringify(v)); } catch (_e) { } },
    del(k, local) { try { (local ? localStorage : sessionStorage).removeItem(k); } catch (_e) { } }
  };
  const setAv = (el, av) => { const s = avSrc(av); if (el && !el.src.endsWith(s)) el.src = s; };
  function miniBoard(canvas, m) { QBoard.draw(canvas, m.board, { colors: ['blue', 'red'], turn: m.ended ? null : m.board.turn }); }
  let ttsRate = Number(store.get('eq-tts', true)) || .85;
  function speak(text) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = ttsRate; speechSynthesis.speak(u); } catch (_e) { toast('이 기기에서는 듣기 기능을 쓸 수 없어요.'); } }
  function rankTable(list, meId, { note = true, avatars = true } = {}) {
    const medal = r => r <= 3 ? `<img class="rank-medal" src="${UI}medal${r}.png" alt="${r}위">` : r;
    return `<table class="rank"><thead><tr><th>순위</th><th>이름</th><th>승리</th><th>패배</th><th>승률</th><th>총점</th></tr></thead><tbody>${list.map(p => `<tr class="${p.rank <= 3 ? 'top' + p.rank : ''} ${p.id === meId ? 'me' : ''}"><td>${medal(p.rank)}</td><td class="name"><span class="name-cell">${avatars ? avImg(p.av, 'xs') : ''}${esc(p.name)}${p.id === meId ? ' (나)' : ''}</span></td><td>${p.w}</td><td>${p.l}</td><td class="${rateCls(p.rate)}">${p.rate}%</td><td><b>${p.score}</b></td></tr>`).join('')}</tbody></table>${note ? '<p class="muted small">총점 = 승리 10점 + 무승부 5점 + 영어 미션 성공 1점</p>' : ''}`;
  }

  /* ═════════ 첫 화면(타이틀 그림 버튼과 창) ═════════ */
  const onOpen = {};
  const openModal = id => { $('#' + id).classList.add('on'); onOpen[id]?.(); };
  const closeModals = () => $$('.modal').forEach(m => m.classList.remove('on'));
  $$('[data-open]').forEach(b => b.onclick = () => openModal(b.dataset.open));
  $$('[data-close]').forEach(b => b.onclick = closeModals);
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  // 캐릭터 고르기
  let myAv = Number(store.get('eq-av', true)); if (![0, 1, 2, 3].includes(myAv)) myAv = Math.floor(Math.random() * 4);
  $('#avPick').innerHTML = AVS.map((_, i) => `<button data-av="${i}" aria-label="캐릭터 ${i + 1}"><img src="${avSrc(i)}" alt=""></button>`).join('');
  const paintAv = () => $$('#avPick button').forEach(b => b.classList.toggle('on', Number(b.dataset.av) === myAv));
  $$('#avPick button').forEach(b => b.onclick = () => { myAv = Number(b.dataset.av); store.set('eq-av', myAv, true); paintAv(); }); paintAv();
  // 문제 미리보기
  let pvKind = 'quiz', pvUnit = 'u10', samples = null;
  $('#pvUnit').innerHTML = Object.entries(UNIT_META).map(([id, u]) => `<button data-v="${id}">${u.em} ${u.no}단원</button>`).join('');
  seg($('#pvUnit'), pvUnit, v => { pvUnit = v; seg($('#pvUnit'), v); renderPreview(); });
  async function renderPreview() {
    if (!samples) { try { samples = await (await fetch('/api/samples')).json(); } catch (_e) { $('#pvBody').innerHTML = '<div class="empty">불러오지 못했어요.</div>'; return; } }
    const U = samples.units.find(u => u.id === pvUnit);
    $('#pvBody').innerHTML = `<p class="muted" style="margin:0">${U.no}단원 · <b>${esc(U.title)}</b> · ${esc(U.topic)} · 문제 ${U.quiz.length}개 · 말하기 ${U.speak.length}문장</p>` + (pvKind === 'quiz'
      ? U.quiz.slice(0, 4).map(q => `<div><div class="qcard" style="font-size:19px">${esc(q.text)}</div><div class="options" style="margin-top:8px">${q.options.map((o, i) => `<button class="opt ${i === q.answer ? 'right' : ''}" disabled><span class="k">${KEYS[i]}</span><span>${esc(o)}</span></button>`).join('')}</div></div>`).join('')
      : U.speak.map(q => `<div class="say-card"><button class="listen" data-say="${esc(q.text)}"><img src="${UI}ic_sound.png" alt="듣기"></button><div><div class="say" style="font-size:22px">${esc(q.text)}</div><div class="mean">${esc(q.meaning || '')}</div></div></div>`).join(''));
    $$('#pvBody [data-say]').forEach(b => b.onclick = () => speak(b.dataset.say));
  }
  seg($('#pvKind'), pvKind, v => { pvKind = v; seg($('#pvKind'), v); renderPreview(); });
  onOpen.mPreview = renderPreview;
  // 오늘의 순위
  async function loadRank() {
    const code = $('#rkCode').value.trim().toUpperCase(); if (!code) return;
    try {
      const r = await fetch('/api/rooms/' + encodeURIComponent(code) + '/ranking'), d = await r.json();
      $('#rkBody').innerHTML = r.ok ? (d.list.length ? rankTable(d.list, store.get('eq-student')?.sid) + `<p class="muted small">${d.ended ? '최종 결과예요.' : '실시간 순위 · 수업이 끝나면 확정돼요.'}</p>` : '<div class="empty">아직 참가한 학생이 없어요.</div>') : `<div class="note bad">${esc(d.error)}</div>`;
    } catch (_e) { $('#rkBody').innerHTML = '<div class="note bad">불러오지 못했어요.</div>'; }
  }
  $('#rkBtn').onclick = loadRank; $('#rkCode').addEventListener('keydown', e => { if (e.key === 'Enter') loadRank(); });
  onOpen.mRank = () => { const s = store.get('eq-student'), t = store.get('eq-teacher', true); if (!$('#rkCode').value && (s || t)) { $('#rkCode').value = (s || t).code; loadRank(); } };
  // 설정·마이크 점검
  seg($('#ttsRate'), String(ttsRate), v => { ttsRate = Number(v); store.set('eq-tts', ttsRate, true); seg($('#ttsRate'), v); speak('Hello! Nice to meet you.'); });
  $('#testListen').onclick = () => speak('Hello! Nice to meet you.');
  onOpen.mSettings = () => { $('#envCheck').innerHTML = `<div>${window.isSecureContext ? '✅ 보안 주소(https)로 접속했어요' : '⚠️ 보안 주소가 아니에요 — 마이크를 쓰려면 https:// 주소로 접속'}</div><div>${SR ? '✅ 음성 인식을 지원하는 브라우저예요' : '⚠️ 음성 인식 미지원 — 크롬(Chrome)을 써 주세요'}</div><div>${'speechSynthesis' in window ? '✅ 문장 듣기(🔊)를 쓸 수 있어요' : '⚠️ 문장 듣기 미지원'}</div>`; };
  $('#testMic').onclick = () => {
    const out = $('#testResult'); out.style.display = 'block';
    if (!SR || !window.isSecureContext) { out.className = 'note bad'; out.textContent = !window.isSecureContext ? 'https:// 주소로 접속해야 마이크를 쓸 수 있어요.' : '이 브라우저는 음성 인식을 지원하지 않아요. 크롬을 사용해 주세요.'; return; }
    const r = new SR(); r.lang = 'en-US'; r.maxAlternatives = 5; let alts = null, err = null;
    out.className = 'note'; out.textContent = '🎙 듣는 중… “Hello! Nice to meet you.”';
    r.onresult = e => { alts = [...e.results[0]].map(a => a.transcript); };
    r.onerror = e => { err = e.error; };
    r.onend = async () => {
      if (!alts) { out.className = 'note bad'; out.textContent = err === 'not-allowed' ? '마이크 권한이 막혀 있어요. 주소창 왼쪽 자물쇠에서 마이크를 허용해 주세요.' : err === 'network' ? '음성 인식에는 인터넷 연결이 필요해요.' : '소리가 들리지 않았어요. 다시 해 보세요.'; return; }
      const d = await (await fetch('/api/speech-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello! Nice to meet you.', alternatives: alts }) })).json();
      out.className = 'note ' + (d.success ? 'good' : 'bad');
      out.textContent = `${d.success ? '✅ 잘 돼요!' : '❌ 조금 달라요.'} 인식: “${d.heard}” · 일치도 ${d.score}%`;
    };
    try { r.start(); } catch (e) { out.textContent = e.message; }
  };
  // 입장·방 만들기
  let newMode = 'quiz';
  seg($('#newMode'), newMode, v => { newMode = v; seg($('#newMode'), v); });
  let newUnits = (store.get('eq-units', true) || ['u10']).filter(x => UNIT_META[x]); if (!newUnits.length) newUnits = ['u10'];
  $('#newUnits').innerHTML = Object.entries(UNIT_META).map(([id, u]) => `<button data-u="${id}"><span class="em">${u.em}</span><b>${u.no}단원</b><small>${u.topic}</small></button>`).join('');
  const paintUnits = () => $$('#newUnits button').forEach(b => b.classList.toggle('on', newUnits.includes(b.dataset.u)));
  $$('#newUnits button').forEach(b => b.onclick = () => { const u = b.dataset.u; newUnits = newUnits.includes(u) ? newUnits.filter(x => x !== u) : [...newUnits, u]; if (!newUnits.length) { newUnits = [u]; toast('단원을 하나 이상 골라 주세요.'); } store.set('eq-units', newUnits, true); paintUnits(); });
  paintUnits();
  if (store.get('eq-teacher', true)) { $('#resumeTeacherBtn').style.display = ''; $('#resumeTeacherBtn').onclick = () => location.href = '/'; }
  if (qp.get('code')) { $('#joinCode').value = qp.get('code').toUpperCase().slice(0, 4); setTimeout(() => { if (!role) openModal('mStudent'); }, 300); }
  $('#joinCode').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  $('#joinName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
  $('#joinBtn').onclick = async () => {
    const r = await emit('student:join', { code: $('#joinCode').value, name: $('#joinName').value, av: myAv });
    if (!r.ok) return toast(r.message);
    store.set('eq-student', { code: r.code, sid: r.sid, token: r.token, name: r.name });
    role = 'student'; closeModals(); show('student'); pane('wait');
    if (r.rejoined) toast(`${r.name} 학생, 다시 왔어요! 기록이 이어집니다.`);
  };
  $('#createBtn').onclick = async () => {
    const r = await emit('teacher:create', { mode: newMode, pin: $('#teacherPin').value, units: newUnits });
    if (!r.ok) return toast(r.message);
    store.set('eq-teacher', { code: r.code, token: r.token }, true);
    role = 'teacher'; closeModals(); show('teacher'); loadInfo();
  };
  $$('.home-btn').forEach(b => b.onclick = () => { if (!confirm('첫 화면으로 갈까요? (교실은 그대로 유지되고, 다시 들어오면 이어집니다)')) return; location.href = '/?home=1'; });

  /* ── 연결 ── */
  socket.on('connect', async () => {
    $('#sNet')?.classList.remove('off');
    const t = store.get('eq-teacher', true), s = store.get('eq-student'), stay = qp.get('home');
    if (role !== 'student' && t && !stay) {
      const r = await emit('teacher:resume', t);
      if (r.ok) { role = 'teacher'; show('teacher'); loadInfo(); return; }
      store.del('eq-teacher', true); if (role === 'teacher') { role = null; show('home'); toast('교실 정보를 찾을 수 없어 첫 화면으로 돌아왔어요.'); }
    }
    if (role !== 'teacher' && s && !stay) {
      const r = await emit('student:resume', s);
      if (r.ok) { role = 'student'; show('student'); return; }
      store.del('eq-student'); role = null; show('home'); toast(r.message);
    }
    if (!role) show('home');
  });
  socket.on('disconnect', () => { $('#sNet')?.classList.add('off'); if (role) toast('서버 연결이 끊겼어요. 다시 연결하는 중…', 4000); });
  socket.on('kicked', ({ message }) => { store.del('eq-student'); role = null; show('home'); toast(message, 5000); });
  socket.on('pub', d => { pub = d; if (role === 'student') renderStudent(); if (role === 'teacher') renderTeacher(); });
  socket.on('me', d => { me = d; if (role === 'student') renderStudent(); });
  socket.on('teacher', d => { ts = d; if (role === 'teacher') renderTeacher(); });

  /* ═════════ 학생 화면 ═════════ */
  function renderStudent() {
    if (!pub) return;
    $('#sCode').textContent = pub.code; $('#sMode').textContent = MODE[pub.mode] + (pub.unitLabel ? ' · ' + pub.unitLabel : '');
    if (pub.status === 'ended' && pub.rankings) { $('#resultOverlay').classList.remove('on'); pane('final'); return renderFinalStudent(); }
    if (!me) return;
    const p = me.me;
    setAv($('#sAv'), p.av); $('#sName').textContent = p.name;
    $('#sW').textContent = p.w; $('#sL').textContent = p.l; $('#sRate').textContent = p.rate + '%';
    if ((p.state === 'match' || p.state === 'result') && me.match) { pane('game'); renderGame(); }
    else { pane('wait'); renderWait(); }
    if (p.state === 'result' && me.match?.ended) showResult(); else { $('#resultOverlay').classList.remove('on'); resultShownFor = null; }
  }
  function renderWait() {
    const p = me.me, lobby = pub.status === 'lobby';
    setAv($('#waitMeAv'), p.av); $('#waitMe').textContent = p.name;
    $('#waitTitle').innerHTML = lobby ? '곧 <em>경기가 시작</em>돼요!' : '상대를 <em>자동으로</em> 찾고 있어요!';
    $('#waitSub').textContent = lobby ? `선생님이 시작을 누르면 2명씩 자동으로 짝이 지어져요. 지금 ${pub.players.length}명이 들어와 있어요.` : '잠시만 기다려 주세요. 곧 게임이 시작됩니다!';
    $('#waitTip').innerHTML = pub.paused ? '⏸ 선생님이 잠시 멈췄어요.' : lobby ? '💡 영어 미션 → 이동 또는 벽 → 맞은편 빨간 줄에 먼저 도착!' : `<span class="spin"></span> 좋은 상대를 찾고 있어요... (${p.waitSec}초)`;
    $('#msW').textContent = p.w; $('#msL').textContent = p.l; $('#msR').textContent = p.rate + '%';
    const box = $('#friendGames'), games = pub.matches.slice(0, 6);
    if (!games.length) { box.innerHTML = `<div class="empty">${lobby ? '입장한 친구: ' + pub.players.map(x => esc(x.name)).join(', ') : '진행 중인 경기가 없어요.'}</div>`; return; }
    box.innerHTML = games.map(m => `<div class="fg"><canvas width="360" height="360" data-mid="${m.id}"></canvas><div class="names"><span class="w">${avImg(m.avs?.[0], 'xs')}${esc(m.names[0])}</span><span class="vsm">VS</span><span class="l">${esc(m.names[1])}${avImg(m.avs?.[1], 'xs')}</span></div></div>`).join('');
    games.forEach(m => miniBoard(box.querySelector(`[data-mid="${m.id}"]`), m));
  }
  function renderGame() {
    const m = me.match, my = m.my, opp = 1 - my, b = m.board, p = me.me, o = m.opp;
    const mode = m.question?.mode || m.oppQuestion?.mode || pub.mode;
    setAv($('#pcMeAv'), p.av); setAv($('#pcOppAv'), o.ai ? 'ai' : o.av);
    $('#pcMeName').textContent = p.name + ' (나)'; $('#pcMeRec').textContent = recTxt(p);
    $('#pcOppName').textContent = o.name; $('#pcOppRec').textContent = o.ai ? '연습 상대 로봇' : (o.w !== undefined ? recTxt(o) : '');
    $('#pcMe').classList.toggle('active', !m.ended && b.turn === my);
    $('#pcOpp').classList.toggle('active', !m.ended && b.turn === opp);
    const total = pub.turnSec || 90, tm = $('#timer');
    if (m.phase === 'ai') { $('#timerTxt').textContent = '🤖 생각 중'; $('#timerBar').style.width = '100%'; tm.classList.remove('low'); }
    else { $('#timerTxt').textContent = (m.ended ? 0 : m.secs) + '초'; $('#timerBar').style.width = Math.max(0, Math.min(100, m.secs / total * 100)) + '%'; tm.classList.toggle('low', !m.ended && m.secs <= 10); }
    $('#wlMe').textContent = $('#wlMe2').textContent = b.left[my]; $('#wlOpp').textContent = $('#wlOpp2').textContent = b.left[opp];
    $('#wsMe').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < b.left[my] ? '' : 'used'}"></i>`).join('');
    $('#wsOpp').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < b.left[opp] ? '' : 'used'}"></i>`).join('');
    $('#pausedCover').classList.toggle('on', !!pub.paused);
    const canAct = m.myTurn && m.phase === 'action' && !pub.paused;
    if (!canAct) { preview = null; tool = 'move'; }
    if (tool === 'wall' && b.left[my] < 1) { tool = 'move'; preview = null; }
    void mode;
    drawMain(); renderMission();
  }
  function drawMain() {
    const m = me?.match; if (!m) return;
    const canAct = m.myTurn && m.phase === 'action' && !pub.paused;
    const colors = []; colors[m.my] = 'blue'; colors[1 - m.my] = 'red';
    QBoard.draw($('#board'), m.board, { flip: m.my === 1, colors, turn: m.ended ? null : m.board.turn,
      moves: canAct && tool === 'move' ? QEngine.legalMoves(m.board, m.my) : [], preview: canAct && tool === 'wall' ? preview : null });
  }
  QBoard.onLoad(() => { if (role === 'student' && me?.match) drawMain(); if (role === 'student') renderStudent(); if (role === 'teacher') renderTeacher(); });
  $('#board').addEventListener('click', e => {
    const m = me?.match; if (!m || m.ended) return;
    if (pub.paused) return toast('선생님이 잠시 멈췄어요.');
    if (!m.myTurn) return toast('지금은 상대 차례예요.');
    if (m.phase !== 'action') return toast('먼저 영어 미션을 통과해 주세요! 👉');
    const h = QBoard.hit($('#board'), e, tool, orient, m.my === 1); if (!h) return;
    if (h.kind === 'move') {
      if (!QEngine.legalMoves(m.board, m.my).some(v => v[0] === h.r && v[1] === h.c)) return toast('빛나는 칸으로만 움직일 수 있어요.');
      return act({ kind: 'move', r: h.r, c: h.c });
    }
    if (preview && preview.ok && preview.r === h.r && preview.c === h.c && preview.o === h.o) return act({ kind: 'wall', r: h.r, c: h.c, o: h.o });
    const chk = QEngine.checkWall(m.board, m.my, h.r, h.c, h.o);
    preview = { ...h, ok: chk.ok, reason: chk.reason };
    drawMain(); renderMission();
  });
  async function act(a) { const r = await emit('game:action', a); if (!r.ok) return toast(r.message); preview = null; tool = 'move'; }

  function lastFeedback(m) {
    const L = m.last; if (!L || L.who !== m.my) return '';
    if (L.kind === 'quiz' && !L.success) return `<div class="feedback bad"><img src="${UI}bub_sad.png" alt="">아쉬워요! 정답은 ${KEYS[L.answer]}. ${esc(L.answerText)} 이었어요. 차례가 넘어갔어요.</div>`;
    if (L.kind === 'speak' && !L.success && L.attempt >= 2) return `<div class="feedback bad"><img src="${UI}bub_fight.png" alt="">2번 모두 인식이 달라 차례가 넘어갔어요. 다음엔 또박또박 천천히!</div>`;
    if (L.kind === 'timeout') return `<div class="feedback info"><img src="${UI}st_watch.png" alt="">시간이 지나서 차례가 넘어갔어요.</div>`;
    if (L.kind === 'move' || L.kind === 'wall') return `<div class="feedback good"><img src="${UI}bub_good.png" alt="">${L.kind === 'move' ? '말을 움직였어요.' : '벽을 설치했어요.'}</div>`;
    return '';
  }
  const RULE = `<div class="rule">🏁 맞은편 <b style="color:var(--red)">빨간 줄</b>에 먼저 도착하면 승리! 벽으로 길을 완전히 막을 수는 없어요.</div>`;
  function renderMission() {
    const m = me.match, q = m.question, el = $('#mission');
    if (Date.now() < holdUntil) { clearTimeout(renderMission.t); renderMission.t = setTimeout(() => { if (me?.match) renderMission(); }, holdUntil - Date.now() + 30); return; }
    const key = JSON.stringify([m.id, m.board.moves, m.phase, m.myTurn, m.attempts, q?.text, q?.mode, tool, orient, preview, pub.paused, m.last?.at, m.ended, m.board.left[m.my]]);
    if (key === missionKey) return; missionKey = key;
    if (recLive) { try { rec.abort(); } catch (_e) { } recLive = false; }
    if (m.ended) { el.innerHTML = `<div class="oppwait"><img src="${UI}st_crown.png" alt="" style="height:60px"><h2>경기가 끝났어요!</h2></div>`; return; }
    if (pub.paused) { el.innerHTML = `<div class="oppwait"><img src="${UI}ic_pause.png" alt="" style="height:80px"><h2>잠시 멈춤</h2><p class="muted">선생님이 다시 시작하면 이어서 진행돼요.</p></div>${RULE}`; return; }
    if (!m.myTurn) {
      el.innerHTML = `<div class="m-head"><span class="clip">⏳</span> 상대 차례예요</div>
        <div class="oppwait">${avImg(m.opp.ai ? 'ai' : m.opp.av, 'xl')}<p><b>${esc(m.opp.name)}</b> ${m.opp.ai ? '로봇이 다음 수를 생각하고 있어요…' : m.phase === 'action' ? '친구가 이동할 곳을 고르고 있어요.' : '친구가 영어 미션을 풀고 있어요.'}</p></div>
        ${m.oppQuestion ? `<div class="oppq">👀 상대의 미션: <b>${esc(m.oppQuestion.text)}</b><br><small class="muted">나도 속으로 답을 생각해 봐요!</small></div>` : ''}
        ${lastFeedback(m)}${RULE}`;
      return;
    }
    if (m.phase === 'action') {
      const walls = m.board.left[m.my], approved = m.last?.kind === 'approve' && m.last.who === m.my;
      el.innerHTML = `<img class="ok-banner" src="${UI}mission_ok.png" alt="미션 성공!">
        <p class="center muted" style="margin:0">${approved ? '선생님이 통과시켜 줬어요. ' : ''}이제 원하는 행동을 선택하세요!</p>
        <button class="gbtn act ${tool === 'move' ? 'on' : ''}" id="aMove"><img src="${UI}pawn_blue.png" alt=""><span>말 이동하기<small>판에서 빛나는 칸을 눌러 한 칸 이동해요.</small></span><span class="arr">›</span></button>
        <button class="gbtn orange act ${tool === 'wall' ? 'on' : ''}" id="aWall" ${walls < 1 ? 'disabled' : ''}><img src="${UI}wall_h.png" alt="" style="height:38px"><span>벽 놓기<small>${walls < 1 ? '남은 벽이 없어요.' : `상대 길을 막아요. (남은 벽 ${walls}개)`}</small></span><span class="arr">›</span></button>
        ${tool === 'wall' ? `<div class="wall-tools"><div class="seg" id="orient"><button data-v="h">━ 가로 벽</button><button data-v="v">┃ 세로 벽</button></div>
          <div class="wall-msg ${preview ? (preview.ok ? 'ok' : 'no') : ''}">${preview ? (preview.ok ? '🟢 놓을 수 있어요! 같은 곳을 한 번 더 누르거나 아래 버튼을 누르세요.' : '🔴 ' + esc(preview.reason)) : '👉 판에서 벽을 놓을 홈(칸 사이)을 눌러 미리 보세요.'}</div>
          <button class="gbtn green" id="wallOk" style="flex:1" ${preview?.ok ? '' : 'disabled'}>✔ 여기에 벽 설치</button><button class="gbtn gray" id="wallCancel">취소</button></div>` : ''}
        ${RULE}`;
      $('#aMove').onclick = () => { tool = 'move'; preview = null; drawMain(); renderMission(); };
      $('#aWall').onclick = () => { tool = 'wall'; drawMain(); renderMission(); };
      if (tool === 'wall') {
        seg($('#orient'), orient, v => { orient = v; if (preview) { const c = QEngine.checkWall(m.board, m.my, preview.r, preview.c, v); preview = { ...preview, o: v, ok: c.ok, reason: c.reason }; } drawMain(); renderMission(); });
        $('#wallOk').onclick = () => preview?.ok && act({ kind: 'wall', r: preview.r, c: preview.c, o: preview.o });
        $('#wallCancel').onclick = () => { tool = 'move'; preview = null; drawMain(); renderMission(); };
      }
      return;
    }
    if (!q) { el.innerHTML = '<div class="empty">문제를 불러오는 중…</div>'; return; }
    if (q.mode === 'quiz') {
      el.innerHTML = `<div class="m-head"><span class="clip">📋</span> 이번 미션: 문제를 맞혀 보세요! <span class="tag">틀리면 차례 넘김</span></div>
        <div class="qcard">${unitTag(q.unit)}<br>${esc(q.text)}</div>
        <div class="options">${q.options.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${KEYS[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>${RULE}`;
      el.querySelectorAll('.opt').forEach(btn => btn.onclick = async () => {
        el.querySelectorAll('.opt').forEach(x => x.disabled = true);
        const r = await emit('game:quiz', { choice: Number(btn.dataset.i) });
        if (!r.ok) { toast(r.message); el.querySelectorAll('.opt').forEach(x => x.disabled = false); return; }
        el.querySelector(`.opt[data-i="${r.answer}"]`)?.classList.add('right');
        if (!r.success) { btn.classList.add('wrong'); toast('아쉬워요! 차례가 상대에게 넘어가요.'); holdUntil = Date.now() + 1800; }
        else { toast('정답이에요! 이제 이동하거나 벽을 놓으세요.'); holdUntil = Date.now() + 700; }
      });
      return;
    }
    renderSpeak(m, q);
  }

  /* ── 말하기 ── */
  function renderSpeak(m, q) {
    const el = $('#mission'), key = m.id + '|' + m.board.moves + '|' + q.text, log = speakLog[key] || [];
    const supported = !!SR && window.isSecureContext;
    const att = i => {
      const r = log[i];
      if (r) return `<div class="att ${r.success ? 'ok' : 'no'}"><div class="t"><span class="num">${r.success ? '✔' : '✖'}</span>${i + 1}차 시도</div><div class="res">${r.success ? '잘했어요!' : '다시 해 봐요'}</div><div class="heard">“${esc(r.heard || '(들리지 않음)')}” · 일치도 ${r.score}%</div></div>`;
      if (i === m.attempts) return `<div class="att now" id="attNow"><div class="t"><span class="num">${i + 1}</span>${i + 1}차 시도</div><div class="wave" id="wave">${'<i></i>'.repeat(14)}</div><div class="heard" id="interim">버튼을 누르고 읽어 주세요</div></div>`;
      if (i < m.attempts) return `<div class="att no"><div class="t"><span class="num">✖</span>${i + 1}차 시도</div><div class="res">다시 해 봐요</div></div>`;
      return `<div class="att"><div class="t"><span class="num">${i + 1}</span>${i + 1}차 시도</div><div class="heard">아직 시도하지 않았어요.</div></div>`;
    };
    const lastR = log[log.length - 1];
    el.innerHTML = `<div class="m-head"><span class="clip">📋</span> 이번 미션: 영어로 말해 보세요! <span class="tag">기회 2번</span></div>
      <div class="say-card"><button class="listen" id="listen" title="문장 듣기"><img src="${UI}ic_sound.png" alt="듣기"></button><div>${unitTag(q.unit)}<div class="say">${esc(q.text)}</div>${q.meaning ? `<div class="mean">${esc(q.meaning)}</div>` : ''}</div></div>
      <div class="attempts">${att(0)}${att(1)}</div>
      ${lastR && !lastR.success ? `<div class="ai-eval bad"><img src="${UI}av_ai.png" alt=""><div><b>AI 평가: 아직 달라요</b><span>일치도 ${lastR.score}% · 단어를 하나씩 또박또박 읽어 봐요.</span></div></div>` : ''}
      ${supported ? `<button class="gbtn green mic" id="mic"><img class="ici" src="${UI}ic_mic.png" alt="">마이크 누르고 문장 읽기</button>`
        : `<div class="feedback info">${!window.isSecureContext ? '🔒 마이크를 쓰려면 선생님이 알려준 https:// 주소로 접속해야 해요.' : '이 브라우저는 음성 인식을 지원하지 않아요. 크롬(Chrome)을 사용해 주세요.'}</div>`}
      <div class="helpline"><span>인식이 잘 안 되나요?</span><button class="linkbtn" id="helpBtn">🙋 선생님께 확인 요청</button></div>${RULE}`;
    $('#listen').onclick = () => speak(q.text);
    $('#helpBtn').onclick = async () => { const r = await emit('game:help', {}); toast(r.ok ? '선생님께 확인을 요청했어요. 잠시만 기다려요!' : r.message); };
    if ($('#mic')) $('#mic').onclick = () => startSpeak(key);
  }
  function startSpeak(key) {
    if (recLive) { try { rec.stop(); } catch (_e) { } return; }
    try { speechSynthesis.cancel(); } catch (_e) { }
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
    let alts = null, err = null; interim = '';
    const btn = $('#mic'), wave = $('#wave'), it = $('#interim');
    const label = t => { if (btn) btn.innerHTML = `<img class="ici" src="${UI}ic_mic.png" alt="">${t}`; };
    rec.onstart = () => { recLive = true; btn?.classList.add('rec'); label('듣고 있어요… (다 읽으면 누르기)'); wave?.classList.add('live'); if (it) it.textContent = '듣는 중…'; };
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) alts = [...res].map(a => a.transcript); else interim = res[0].transcript; }
      if (it) it.textContent = '“' + (alts?.[0] || interim) + '”';
    };
    rec.onerror = e => { err = e.error; };
    rec.onend = async () => {
      recLive = false; clearTimeout(startSpeak.t); btn?.classList.remove('rec'); wave?.classList.remove('live');
      if (!alts && interim) alts = [interim];
      if (!alts) {
        label('마이크 누르고 문장 읽기'); if (it) it.textContent = '버튼을 누르고 읽어 주세요';
        return toast(err === 'not-allowed' || err === 'service-not-allowed' ? '마이크 사용을 허용해 주세요. (주소창 왼쪽 자물쇠 → 마이크 허용)' : err === 'network' ? '인터넷 연결이 필요해요. (음성 인식은 인터넷을 사용해요)' : '소리가 잘 들리지 않았어요. 기회는 그대로예요. 다시 눌러 말해 보세요!', 3600);
      }
      if (btn) { btn.disabled = true; label('AI가 평가하는 중…'); }
      const r = await emit('game:speak', { alternatives: alts });
      if (!r.ok) { toast(r.message); missionKey = ''; return renderMission(); }
      (speakLog[key] = speakLog[key] || []).push({ success: r.success, score: r.score, heard: r.heard });
      if (r.success) { toast(`🎉 정확해요! (일치도 ${r.score}%)`); holdUntil = Date.now() + 1400; showSpeakSuccess(r); }
      else if (r.attempts >= 2) { toast('2번 모두 달라서 차례가 넘어가요.'); holdUntil = Date.now() + 2200; showSpeakTwoFail(); }
      else toast('조금 달라요. 한 번 더 기회가 있어요!');
      missionKey = '';
      if (Date.now() >= holdUntil) renderMission();
    };
    try { rec.start(); startSpeak.t = setTimeout(() => { try { rec.stop(); } catch (_e) { } }, 9000); }
    catch (e) { toast('마이크를 시작할 수 없어요: ' + e.message); }
  }
  function showSpeakSuccess(r) {
    const el = $('#mission');
    el.querySelector('.ai-eval')?.remove(); el.querySelector('#mic')?.remove();
    el.querySelector('#attNow')?.replaceWith(Object.assign(document.createElement('div'), { className: 'att ok', innerHTML: `<div class="t"><span class="num">✔</span>성공</div><div class="res">잘했어요!</div><div class="heard">“${esc(r.heard)}” · 일치도 ${r.score}%</div>` }));
    const box = document.createElement('div'); box.className = 'ai-eval good';
    box.innerHTML = `<img src="${UI}av_ai.png" alt=""><div><b>AI 평가 결과: 정확해요!</b><span>문장을 정확하게 읽었어요.</span></div>`;
    el.querySelector('.attempts').after(box);
  }
  function showSpeakTwoFail() {
    const el = $('#mission'); el.querySelector('#mic')?.remove();
    el.querySelector('#attNow')?.replaceWith(Object.assign(document.createElement('div'), { className: 'att no', innerHTML: `<div class="t"><span class="num">✖</span>2차 시도</div><div class="res">다음 기회에!</div>` }));
  }

  /* ── 경기 결과 ── */
  function showResult() {
    const m = me.match, p = me.me, o = m.opp, my = m.my, ov = $('#resultOverlay');
    const draw = m.winner === null, iWon = m.winner === my;
    if (resultShownFor !== m.id) {
      resultShownFor = m.id;
      const card = (who, won) => {
        const isMe = who === my, info = isMe ? p : o, color = isMe ? 'blue' : 'red';
        const badge = draw ? 'draw_medal' : won ? 'win_badge' : 'lose_badge';
        const bub = draw ? 'bub_thanks' : won ? (isMe ? 'bub_great' : 'bub_good') : (isMe ? 'bub_fight' : 'bub_sad');
        return `<div class="res-card ${color}"><img class="badge" src="${UI}${badge}.png" alt="${draw ? '무승부' : won ? '승리' : '패배'}">
          <div class="who">${avImg(info.ai ? 'ai' : info.av, 'sm')}${esc(info.name)}${isMe ? ' (나)' : ''}</div>
          ${info.w !== undefined ? `<div class="stats"><div><img src="${UI}st_crown.png" alt="">승리<b class="w">${info.w}</b></div><div><img src="${UI}st_x.png" alt="">패배<b class="l">${info.l}</b></div><div><img src="${UI}st_bars.png" alt="">승률<b class="g">${info.rate}%</b></div></div>` : '<div class="stats"><div>🤖 AI 연습 상대</div></div>'}
          ${isMe ? `<img class="bub" src="${UI}${bub}.png" alt="">` : ''}</div>`;
      };
      const left = draw ? my : m.winner, right = 1 - left;
      const reason = m.aborted ? '상대가 교실에서 나가서 이번 경기는 기록되지 않아요.' : m.reason === '연결 끊김' ? (iWon ? '상대의 연결이 끊겨서 승리했어요.' : '연결이 오래 끊겨서 경기가 끝났어요.') : /행동 수/.test(m.reason) ? '행동 수 제한에 도달해 남은 거리로 승부를 정했어요.' : draw ? '팽팽한 승부였어요!' : iWon ? '끝까지 포기하지 않고 목표에 도착했어요!' : '이번엔 친구가 먼저 도착했어요. 다음엔 꼭 이길 수 있어요!';
      const side = m.side[my];
      $('#resultBox').innerHTML = `<img class="gameover" src="${UI}gameover.png" alt="게임 종료!"><div class="res-reason">${esc(reason)}</div>
        <div class="res-grid">${card(left, !draw)}<div class="res-board"><canvas id="resCanvas" width="800" height="800"></canvas></div>${card(right, false)}</div>
        <div class="res-stats">
          <div class="rs"><img src="${UI}st_watch.png" alt=""><div><small>게임 시간</small><b>${mmss(m.durationSec || 0)}</b></div></div>
          <div class="rs"><img src="${UI}st_wall.png" alt=""><div><small>사용한 벽 (나 / 상대)</small><b><span class="w">${10 - m.board.left[my]}개</span> / <span class="l">${10 - m.board.left[1 - my]}개</span></b></div></div>
          <div class="rs"><img src="${UI}st_check.png" alt=""><div><small>내 영어 미션 성공 / 실패</small><b><span class="g">${side.ok}개</span> / <span class="l">${side.no}개</span></b></div></div>
          <div class="rs next"><img src="${UI}st_watch.png" alt=""><div><small>다음 게임이 곧 시작됩니다!</small><b id="nextLeft">${p.resultLeft}초 후 자동 매칭</b></div></div>
        </div>`;
      const colors = []; colors[my] = 'blue'; colors[1 - my] = 'red';
      QBoard.draw($('#resCanvas'), m.board, { flip: my === 1, colors });
    } else { const n = $('#nextLeft'); if (n) n.textContent = `${p.resultLeft}초 후 자동 매칭`; }
    ov.classList.add('on');
  }

  /* ── 최종 순위(학생·교사 공통 부품) ── */
  function podium(rk) {
    const top = [1, 2, 3].map(r => rk.find(p => p.rank === r) || rk[r - 1]).map(p => p || null);
    return `<div class="podium-wrap"><img class="podium" src="${UI}podium.png" alt="">${top.map((p, i) => p ? `<div class="pp p${i + 1}">${avImg(p.av)}<span>${esc(p.name)}</span></div>` : '').join('')}</div>`;
  }
  function renderFinalStudent() {
    const rk = pub.rankings, sid = store.get('eq-student')?.sid, mine = rk.find(p => p.id === sid);
    const msgs = ['우리 반 쿼리도 챔피언!', '정말 잘했어요!', '멋진 실력이에요!'];
    $('#sFinal').innerHTML = `<div class="final">
      <div class="final-head"><img class="final-logo" src="${UI}logo_tour.png" alt="영어 쿼리도 교실 토너먼트">${podium(rk)}</div>
      ${mine ? `<div class="panel my-final">${mine.rank <= 3 ? `<img class="medal" src="${UI}medal${mine.rank}.png" alt="">` : `<div class="big">${mine.rank}위</div>`}${avImg(mine.av, 'xl')}<div><h2>${esc(mine.name)} · ${mine.rank}위</h2><p>${msgs[mine.rank - 1] || '끝까지 열심히 했어요! 👏'}</p><b>${recTxt(mine)} · 총점 ${mine.score}점</b></div><img src="${UI}${mine.rank <= 3 ? 'bub_great' : 'bub_thanks'}.png" alt="" style="height:70px;margin-left:auto"></div>` : ''}
      <div class="panel framed"><div class="frame-title"><img src="${UI}ic_trophy.png" alt=""> 최종 순위 <small class="muted">학생들의 토너먼트 최종 결과입니다.</small></div>${rankTable(rk, sid)}</div></div>`;
  }

  /* ═════════ 교사 화면 ═════════ */
  let tTab = 'overview', tView = 'cards', tRec = 'roster', analysis = null;
  async function loadInfo() { try { info = await (await fetch('/api/info')).json(); renderTeacher(); } catch (_e) { } }
  const tCred = () => store.get('eq-teacher', true) || {};
  const goTab = v => { tTab = v; seg($('#tTabs'), v); $$('#tLive .tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + v)); if (v === 'records' && tRec === 'wrong') loadAnalysis(); renderTeacher(); };
  seg($('#tTabs'), tTab, goTab); goTab('overview');
  $$('[data-goto]').forEach(b => b.onclick = () => goTab(b.dataset.goto));
  seg($('#tView'), tView, v => { tView = v; seg($('#tView'), v); $('#tMatches').classList.toggle('list', v === 'list'); });
  seg($('#tRec'), tRec, v => { tRec = v; seg($('#tRec'), v); if (v === 'wrong') loadAnalysis(); renderRecords(); });
  seg($('#tMode'), 'quiz', async v => { const r = await emit('teacher:mode', { mode: v }); toast(r.ok ? (v === 'speak' ? '말하기 활동으로 바꿨어요.' : '문제 풀기 활동으로 바꿨어요.') : r.message); });
  $('#tTurnSec').onchange = async e => { const r = await emit('teacher:turnSec', { sec: Number(e.target.value) }); toast(r.ok ? `차례 시간: ${e.target.value}초 (다음 차례부터)` : r.message); };
  $('#tStart').onclick = async () => { const r = await emit('teacher:start', {}); toast(r.ok ? '🎲 경기를 시작했어요! 2명씩 자동으로 매칭됩니다.' : r.message); };
  $('#tPause').onclick = async () => { const r = await emit('teacher:pause', {}); if (!r.ok) toast(r.message); };
  $('#tEnd').onclick = async () => { if (!confirm('게임을 끝내고 최종 순위를 확정할까요?\n(진행 중인 경기는 기록되지 않아요)')) return; const r = await emit('teacher:end', {}); if (!r.ok) toast(r.message); };
  $('#copyCode').onclick = () => { navigator.clipboard?.writeText(ts?.code || '').then(() => toast('방 코드를 복사했어요.'), () => toast(ts?.code)); };
  $('#qrBtn').onclick = () => { const url = (info?.studentUrl || location.origin) + '/?code=' + (ts?.code || ''); $('#qrImg').src = '/api/qr.svg?text=' + encodeURIComponent(url); $('#qrText').textContent = url; $('#qrModal').classList.add('on'); };
  async function download() {
    const c = tCred();
    try {
      const r = await fetch(`/api/rooms/${c.code}/export.xlsx`, { headers: { 'x-teacher-token': c.token } });
      if (!r.ok) throw new Error((await r.json()).error);
      const blob = await r.blob(), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `영어쿼리도_${c.code}_${ts?.status === 'ended' ? '최종결과' : '중간결과'}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast('다운로드 실패: ' + e.message); }
  }
  $('#dlMid').onclick = download;
  $('#tUnitChip').onclick = () => goTab('bank');
  // 문제 업로드
  const bankErr = { quiz: '', speak: '' };
  $$('.bank[data-kind]').forEach(box => {
    const kind = box.dataset.kind, input = box.querySelector('input'), drop = box.querySelector('.drop');
    const send = async file => {
      if (!file) return;
      const c = tCred(), fd = new FormData(); fd.append('file', file);
      box.querySelector('.bank-info').innerHTML = '⏳ 올리는 중…';
      try {
        const r = await fetch(`/api/rooms/${c.code}/upload?kind=${kind}`, { method: 'POST', headers: { 'x-teacher-token': c.token }, body: fd });
        const d = await r.json(); if (!r.ok) throw new Error(d.error);
        toast(`✅ ${kind === 'speak' ? '말하기 문장' : '5지선다 문제'} ${d.count}개를 등록하고 '직접 올린 문제'로 바꿨어요.`, 4000); bankErr[kind] = '';
      } catch (e) { bankErr[kind] = e.message; renderBanks(); }
      input.value = '';
    };
    input.onchange = () => send(input.files[0]);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); send(e.dataTransfer.files[0]); });
  });
  async function setUnits(sel) { const r = await emit('teacher:units', { sel }); toast(r.ok ? `문제 단원: ${r.label} (다음 문제부터 적용)` : r.message); }
  function renderBanks() {
    if (!ts) return;
    const B = ts.bank, sel = B.sel, cus = B.custom;
    const key = JSON.stringify([sel, cus, B.units.length, ts.mode, B.active]);
    if (renderBanks.key !== key) {
      renderBanks.key = key;
      $('#unitCards').innerHTML = B.units.map(u => `<button class="ucard ${sel.includes(u.id) ? 'on' : ''}" data-u="${u.id}"><span class="em">${UNIT_META[u.id]?.em || '📘'}</span><span><b>${u.no}단원</b><small>${esc(u.title)}</small><small>${esc(u.topic)}</small><div class="cnt">문제 ${u.quiz}개 · 말하기 ${u.speak}문장</div></span></button>`).join('')
        + `<button class="ucard ${sel.includes('custom') ? 'on' : ''} ${cus.quiz + cus.speak ? '' : 'disabled'}" data-u="custom"><img src="${UI}ic_excel.png" alt=""><span><b>직접 올린 문제</b><small>${cus.quiz + cus.speak ? `${esc(cus.name.quiz || cus.name.speak)}` : '아래에서 엑셀을 올리면 쓸 수 있어요'}</small><div class="cnt">문제 ${cus.quiz}개 · 말하기 ${cus.speak}문장</div></span></button>`;
      $$('#unitCards .ucard').forEach(b => b.onclick = () => { const u = b.dataset.u; setUnits(sel.includes(u) ? sel.filter(x => x !== u) : [...sel, u]); });
      const A = B.active[ts.mode], other = B.active[ts.mode === 'quiz' ? 'speak' : 'quiz'];
      $('#activeInfo').innerHTML = `지금 학생들에게 나가는 문제: <b>${esc(B.label)}</b> · ${ts.mode === 'quiz' ? '5지선다' : '말하기'} <b>${A.count}개</b> <small class="muted">(다른 활동으로 바꾸면 ${other.count}개)</small>
        ${A.fallback ? `<div class="err" style="color:var(--red-d);font-weight:700">⚠ 고른 곳에 ${ts.mode === 'quiz' ? '5지선다 문제' : '말하기 문장'}가 없어서 10~12단원 전체 문제를 내고 있어요.</div>` : ''}
        <ul>${A.preview.map(t => `<li>${esc(t)}</li>`).join('')}${A.count > A.preview.length ? `<li class="muted">… 외 ${A.count - A.preview.length}개</li>` : ''}</ul>`;
    }
    for (const kind of ['speak', 'quiz']) {
      const n = cus[kind], el = $(`.bank[data-kind="${kind}"] .bank-info`);
      el.innerHTML = `${bankErr[kind] ? `<div class="err">❌ ${esc(bankErr[kind])}</div>` : ''}
        <div class="row" style="justify-content:space-between"><span>올린 ${kind === 'speak' ? '문장' : '문제'} <span class="cnt">${n}개</span> ${n ? `<small class="muted">(${esc(cus.name[kind])})</small>` : ''}</span>${n ? `<button class="gbtn wood sm" data-reset="${kind}">올린 것 지우기</button>` : ''}</div>`;
      el.querySelector('[data-reset]')?.addEventListener('click', async () => { if (!confirm('올린 문제를 지울까요?')) return; await emit('teacher:resetBank', { kind }); toast('올린 문제를 지웠어요.'); });
    }
  }
  async function loadAnalysis() {
    const c = tCred();
    try { analysis = await (await fetch(`/api/rooms/${c.code}/analysis`, { headers: { 'x-teacher-token': c.token } })).json(); renderRecords(); } catch (_e) { }
  }
  function renderRecords() {
    if (!ts) return;
    const body = $('#tRecBody'), st = { idle: '대기실', queue: '매칭 대기', match: '경기 중', result: '결과 확인', done: '종료' };
    const pct = (a, b) => (a + b) ? Math.round(a / (a + b) * 100) : null;
    const bar = v => v === null ? '<span class="muted">—</span>' : `<span class="bar"><i style="width:${v}%"></i></span>${v}%`;
    const nm = s => `<span class="name-cell">${avImg(s.av, 'xs')}${esc(s.name)}</span>`;
    if (tRec === 'roster') {
      body.innerHTML = ts.students.length ? `<table class="tbl"><thead><tr><th>이름</th><th>상태</th><th>전적</th><th>총점</th><th></th></tr></thead><tbody>${ts.students.map(s => `<tr><td>${nm(s)}</td><td><span class="on-dot ${s.online ? 'y' : ''}"></span>${s.online ? st[s.state] || '' : '<span class="muted">연결 끊김</span>'}</td><td>${recTxt(s)}${s.ai ? ` <small class="muted">(AI전 ${s.ai})</small>` : ''}</td><td><b>${s.score}</b></td><td>${ts.status !== 'ended' ? `<button class="gbtn gray sm" data-kick="${s.id}">내보내기</button>` : ''}</td></tr>`).join('')}</tbody></table><p class="muted small">이름을 잘못 입력한 학생은 내보낸 뒤 다시 입장하게 하세요. 연결이 끊긴 학생은 같은 이름으로 다시 들어오면 기록이 이어집니다.</p>` : '<div class="empty">아직 입장한 학생이 없어요.</div>';
      body.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => { const s = ts.students.find(x => x.id === b.dataset.kick); if (confirm(`${s?.name} 학생을 내보낼까요? (기록도 함께 지워집니다)`)) { const r = await emit('teacher:remove', { sid: b.dataset.kick }); toast(r.ok ? '내보냈어요.' : r.message); } });
    } else if (tRec === 'learn') {
      body.innerHTML = `<table class="tbl"><thead><tr><th>이름</th><th>퀴즈 정답률</th><th>말하기 성공률</th><th>교사 승인</th><th>시간 초과</th></tr></thead><tbody>${ts.students.map(s => { const x = s.stats; return `<tr><td>${nm(s)}</td><td>${bar(pct(x.quizOk, x.quizNo))} <small class="muted">(${x.quizOk}/${x.quizOk + x.quizNo})</small></td><td>${bar(pct(x.speakOk, x.speakNo))} <small class="muted">(${x.speakOk}/${x.speakOk + x.speakNo})</small></td><td>${x.approved}회</td><td>${x.timeouts}회</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">학생이 참가하면 표시됩니다.</td></tr>'}</tbody></table><p class="muted small">말하기는 인식 결과만 비교하고 학생 목소리는 저장하지 않아요. 전체 내용은 [수업 종료] 탭의 엑셀 저장에 들어 있어요.</p>`;
    } else {
      if (!analysis) { body.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
      body.innerHTML = `<div class="row" style="justify-content:space-between;margin-top:6px"><h3>학급이 자주 틀린 문제</h3><button class="gbtn wood sm" id="reAna">↻ 새로고침</button></div>
        ${analysis.weak.length ? analysis.weak.slice(0, 12).map(q => `<div class="weak"><b>${esc(q.text)}</b><br><small class="muted">${q.mode === 'quiz' ? '5지선다' : '말하기'} · 틀린 학생 ${q.students}명 · 틀림 ${q.no}회 · 맞음 ${q.ok}회${q.mode === 'quiz' ? ` · 정답 ${KEYS[q.answer]}. ${esc(q.options[q.answer])}` : ''}</small></div>`).join('') : '<div class="empty">아직 틀린 문제가 없어요.</div>'}
        <h3 style="margin-top:14px">학생별 오답</h3>${analysis.students.filter(s => s.items.length).map(s => `<div class="weak"><b>${esc(s.name)}</b><br><small class="muted">${s.items.slice(0, 6).map(q => `${esc(q.text)} (${q.no}회${q.mode === 'quiz' && Object.keys(q.picks).length ? ', 고른 답 ' + Object.keys(q.picks).map(i => KEYS[i]).join('·') : ''})`).join(' / ')}</small></div>`).join('') || '<div class="empty">기록 없음</div>'}`;
      $('#reAna').onclick = loadAnalysis;
    }
  }
  const cardCache = { full: new Map(), mini: new Map() };
  function syncCards(grid, cache, matches, compact) {
    const ids = new Set(matches.map(m => m.id));
    for (const [id, el] of cache) if (!ids.has(id)) { el.remove(); cache.delete(id); }
    if (!matches.length) { if (!grid.querySelector('.empty')) grid.innerHTML = `<div class="empty">${ts.status === 'lobby' ? '게임을 시작하면 경기가 여기에 나타나요.' : '지금 진행 중인 경기가 없어요. (매칭 대기 중)'}</div>`; return; }
    grid.querySelector('.empty')?.remove();
    for (const m of matches) {
      let el = cache.get(m.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'mc';
        el.innerHTML = `<div class="mh"><span class="no"></span><span class="st"></span><span class="tm"></span></div><div class="vsr"><div class="pl blue"></div><img class="vsm" src="${UI}vs.png" alt="VS"><div class="pl red"></div></div><canvas width="${compact ? 300 : 420}" height="${compact ? 300 : 420}"></canvas><div class="ms"></div><div class="ap"></div>`;
        grid.appendChild(el); cache.set(m.id, el);
      }
      const ai = m.ids.includes('AI');
      el.querySelector('.no').textContent = `경기 ${m.no}`;
      const stEl = el.querySelector('.st'); stEl.textContent = compact ? '' : ai ? '● AI와 대결 중' : '● 진행 중'; stEl.classList.toggle('ai', ai);
      el.querySelector('.tm').textContent = `⏱ ${m.secs}초`;
      [0, 1].forEach(i => { const pl = el.querySelectorAll('.pl')[i], html = `${avImg(m.avs?.[i], 'sm')}<span>${esc(m.names[i])}</span>`; if (pl.dataset.h !== html) { pl.innerHTML = html; pl.dataset.h = html; } pl.classList.toggle('turn', m.board.turn === i); });
      const who = m.names[m.board.turn];
      el.querySelector('.ms').textContent = m.phase === 'ai' ? '🤖 AI가 생각 중' : m.phase === 'action' ? `✅ ${who} 미션 통과 · 행동 고르는 중` : `📘 ${who} 영어 미션 중${m.attempts ? ` (${m.attempts}/2 실패)` : ''}`;
      el.classList.toggle('help', !!m.help);
      const ap = el.querySelector('.ap'), can = ts.mode === 'speak' && m.phase === 'question' && !ts.paused;
      const apHtml = can ? `<button class="gbtn orange sm approve">🎤 ${esc(who)} 말하기 통과 승인</button>` : '';
      if (ap.dataset.h !== apHtml) { ap.innerHTML = apHtml; ap.dataset.h = apHtml; ap.querySelector('button')?.addEventListener('click', () => approve(m.id)); }
      miniBoard(el.querySelector('canvas'), m);
    }
  }
  function renderTeacher() {
    if (!ts) return;
    const live = ts.status !== 'ended';
    $('#tLive').style.display = live ? '' : 'none'; $('#tFinal').style.display = live ? 'none' : '';
    $('#tCode').textContent = ts.code;
    $('#tUrl').innerHTML = info?.studentUrl ? `학생 접속 주소: <b>${esc(info.studentUrl)}</b> · 방 코드 <b>${esc(ts.code)}</b>` : '';
    seg($('#tMode'), ts.mode); $('#tTurnSec').value = String(ts.turnSec); $('#tUnit').textContent = ts.bank.label;
    $('#tStart').disabled = ts.status !== 'lobby'; $('#tStart').style.display = ts.status === 'lobby' ? '' : 'none';
    $('#tPause').disabled = ts.status !== 'playing';
    $('#tPauseIc').src = UI + (ts.paused ? 'ic_play.png' : 'ic_pause.png'); $('#tPauseTx').textContent = ts.paused ? '다시 시작' : '일시정지';
    $('#tPause').className = 'gbtn ' + (ts.paused ? 'green' : 'blue');
    $('#tEnd').disabled = ts.status !== 'playing';
    if (!live) return renderTeacherFinal();
    const on = ts.students.filter(s => s.online).length, matches = pub?.matches || [];
    $('#tsStudents').textContent = on; $('#tsMax').textContent = `/ ${ts.maxStudents}`;
    $('#tsGames').textContent = matches.length; $('#tsWait').textContent = pub?.waiting?.length || 0;
    $('#tsAI').textContent = matches.filter(m => m.ids.includes('AI')).length;
    $('#tBanner').innerHTML = ts.paused ? '⏸ 일시정지 중이에요. 학생 화면도 멈춰 있어요. 위의 [다시 시작]을 누르면 이어서 진행됩니다. (서버를 다시 켠 경우에도 이 상태로 시작해요)'
      : ts.status === 'lobby' ? `👋 학생들에게 방 코드 <b>${esc(ts.code)}</b>${info?.studentUrl ? ` 와 주소 <b>${esc(info.studentUrl)}</b>` : ''} 를 알려 주세요. 모두 들어오면 위의 [게임 시작]! (지금 ${on}명)` : '';
    $('#helpList').innerHTML = (ts.help || []).filter(h => h.help || h.attempts > 0).map(h => `<div class="help-item"><span class="who">${h.help ? '🙋' : '🎤'} <b>${esc(h.name)}</b> ${h.help ? '학생이 확인을 요청했어요' : `${h.attempts}/2회 인식 실패`} · “${esc(h.text)}”</span><button class="gbtn orange sm" data-approve="${h.matchId}">말하기 통과 승인</button></div>`).join('');
    $$('#helpList [data-approve]').forEach(b => b.onclick = () => approve(b.dataset.approve));
    if (tTab === 'overview') syncCards($('#tMatchesMini'), cardCache.mini, matches, true);
    if (tTab === 'live') syncCards($('#tMatches'), cardCache.full, matches, false);
    const ranked = [...ts.students].sort((a, b) => b.score - a.score || b.w - a.w || b.rate - a.rate || a.l - b.l || a.name.localeCompare(b.name, 'ko'));
    ranked.forEach((p, i) => { const q = ranked[i - 1]; p.rank = q && q.score === p.score && q.w === p.w && q.rate === p.rate && q.l === p.l ? q.rank : i + 1; });
    $('#tRankCount').textContent = `총 ${ranked.length}명 참여`;
    $('#tRanking').innerHTML = ranked.length ? rankTable(ranked, null, { note: false }) : '<div class="empty">참가자를 기다리고 있어요.</div>';
    if (tTab === 'bank') renderBanks();
    if (tTab === 'records' && tRec !== 'wrong') renderRecords();
  }
  async function approve(matchId) { const r = await emit('teacher:approve', { matchId }); toast(r.ok ? `✅ ${r.name} 학생 말하기를 통과시켰어요.` : r.message); }
  function renderTeacherFinal() {
    const rk = ts.rankings || [], avg = rk.length ? Math.round(rk.reduce((a, p) => a + p.rate, 0) / rk.length) : 0;
    $('#tFinal').innerHTML = `<div class="final" style="padding:6px 0">
      <div class="final-head"><img class="final-logo" src="${UI}logo_tour.png" alt="영어 쿼리도 교실 토너먼트">
        <div class="row center" style="gap:18px">${podium(rk)}<button class="imgbtn dl-btn" id="dlFinal" aria-label="결과 다운로드"><img src="${UI}btn_download.png" alt="결과 다운로드 - 엑셀 파일로 저장하기"></button></div></div>
      <div class="kpis" style="margin-top:14px">
        <div class="panel kpi"><img src="${UI}k_students.png" alt=""><div><small>전체 학생 수</small><b>${rk.length}명</b></div></div>
        <div class="panel kpi"><img src="${UI}k_swords.png" alt=""><div><small>총 경기 수</small><b>${ts.totalGames}경기</b></div></div>
        <div class="panel kpi"><img src="${UI}k_robot.png" alt=""><div><small>AI 경기 수</small><b>${ts.aiGames}경기</b></div></div>
        <div class="panel kpi"><img src="${UI}k_bars.png" alt=""><div><small>평균 승률</small><b>${avg}%</b></div></div>
      </div>
      <div class="final-grid">
        <div class="panel framed"><div class="frame-title"><img src="${UI}ic_trophy.png" alt=""> 최종 순위 <small class="muted">모든 경기가 종료된 후의 최종 순위입니다.</small></div>${rankTable(rk, null)}</div>
        <div class="panel framed"><div class="frame-title"><img src="${UI}ic_flag.png" alt=""> 최근 완료된 경기 <small class="muted">가장 최근에 종료된 경기 결과</small></div><div class="recent">${(ts.recent || []).map((h, i) => `<div class="rc"><div class="rh"><span>${h.no}경기</span><small>${new Date(h.endedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · ${mmss(h.durationSec)}</small></div><div class="rb"><canvas width="240" height="240" data-ri="${i}"></canvas><div class="vsline"><span class="w">${avImg(h.avs?.[0], 'xs')}${esc(h.names[0])}</span><span class="muted">VS</span><span class="l">${avImg(h.avs?.[1], 'xs')}${esc(h.names[1])}</span></div><div class="won ${h.winner === null ? 'd' : h.winner === 0 ? 'b' : 'r'}">${h.winner === null ? '무승부' : '👑 ' + esc(h.names[h.winner]) + ' 승리'}</div></div></div>`).join('') || '<div class="empty">완료된 경기가 없어요.</div>'}</div></div>
      </div>
      <div class="row center" style="margin-top:18px"><button class="gbtn wood big" id="newClass" style="width:auto">＋ 새 교실 만들기</button></div></div>`;
    (ts.recent || []).forEach((h, i) => QBoard.draw($(`#tFinal [data-ri="${i}"]`), h.board, { colors: ['blue', 'red'] }));
    $('#dlFinal').onclick = download;
    $('#newClass').onclick = () => { if (!confirm('이 교실을 닫고 첫 화면으로 갈까요? (결과는 먼저 엑셀로 저장해 두세요)')) return; store.del('eq-teacher', true); location.href = '/'; };
  }
})();
