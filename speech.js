/* 말하기 판정: 브라우저 음성인식(AI)이 받아쓴 문장과 제시 문장을 비교해 일치도(0~100)를 계산합니다.
   - 대소문자·문장부호 무시, 축약형(I'd ↔ I would) 통일, 숫자(11 ↔ eleven) 통일
   - 철자가 한 글자 다르게 인식된 단어는 맞은 것으로 인정(4글자 이상) */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numberWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
  return String(n);
}
const ORD = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth', '11th': 'eleventh', '12th': 'twelfth' };
const CONTRACTIONS = [
  [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'],
  [/\blet's\b/g, 'let us'], [/\bi'm\b/g, 'i am'], [/\b(\w+)n't\b/g, '$1 not'], [/\b(\w+)'re\b/g, '$1 are'],
  [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'ll\b/g, '$1 will'], [/\b(\w+)'d\b/g, '$1 would'],
  [/\b(it|that|what|where|there|here|he|she|who|how|this)'s\b/g, '$1 is']
];
function normalize(text) {
  let t = String(text || '').toLowerCase().replace(/[’‘`´]/g, "'");
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  t = t.replace(/\b(\d+)(st|nd|rd|th)\b/g, m => ORD[m] || m);
  t = t.replace(/\b\d{1,3}\b/g, m => numberWords(Number(m)));
  t = t.replace(/'s\b/g, ' s').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ') : [];
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function scoreOne(target, heard) {
  const t = normalize(target), h = normalize(heard);
  if (!t.length || !h.length) return { score: 0, success: false };
  const used = new Array(h.length).fill(false);
  let hit = 0;
  for (const w of t) {
    let idx = h.findIndex((x, i) => !used[i] && x === w);
    if (idx < 0 && w.length >= 4) idx = h.findIndex((x, i) => !used[i] && lev(x, w) <= 1);
    if (idx >= 0) { used[idx] = true; hit++; }
  }
  const extra = Math.max(0, h.length - t.length - 2); // 덧붙인 말이 너무 많으면 감점
  const eff = Math.max(0, hit - extra * 0.5);
  const allowedMiss = Math.floor(t.length / 6);           // 5단어 이하: 모두 맞아야, 6~11단어: 1개, 12단어 이상: 2개까지 허용
  return { score: Math.round(eff / t.length * 100), success: eff >= t.length - allowedMiss };
}
const PASS = 80; // 안내용 기준(실제 판정은 문장 길이에 따라 놓친 단어 수로 결정)
function evaluate(target, alternatives) {
  const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).map(x => String(x || '').slice(0, 300)).filter(Boolean).slice(0, 6);
  let best = { score: 0, success: false, heard: alts[0] || '' };
  for (const a of alts) { const r = scoreOne(target, a); if (r.success > best.success || (r.success === best.success && r.score > best.score)) best = { ...r, heard: a }; }
  return { ...best, pass: PASS };
}
module.exports = { evaluate, normalize, scoreOne, PASS };
