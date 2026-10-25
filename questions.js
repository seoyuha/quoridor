/* 문제 은행: 기본 예시, 엑셀/CSV 업로드 해석, 예시 양식 생성 */
const XLSX = require('xlsx');
const { UNITS } = require('./units');

// 예시 양식은 10단원 문제로 채움
const DEFAULT_QUIZ = UNITS.u10.quiz, DEFAULT_SPEAK = UNITS.u10.speak;
const MAX_ROWS = 5000;
const key = k => String(k).replace(/\s/g, '').replace(/[()（）]/g, '').toLowerCase();
const pick = (r, names) => { for (const n of names) if (r[n] !== undefined && String(r[n]).trim() !== '') return String(r[n]).trim(); return ''; };
const CIRCLED = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };

function parseBank(buffer, kind) {
  let book;
  // CSV는 직접 글자로 바꿔 읽음: UTF-8(BOM 포함)과 엑셀에서 저장한 한글 CSV(CP949) 모두 지원
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b, isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf;
  try {
    if (isZip || isOle) book = XLSX.read(buffer, { type: 'buffer' });
    else {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (_e) { text = new TextDecoder('euc-kr').decode(buffer); }
      book = XLSX.read(text.replace(/^\ufeff/, ''), { type: 'string', raw: true });
    }
  } catch (e) { throw new Error('파일을 읽을 수 없습니다. 엑셀(.xlsx) 또는 CSV 파일인지 확인하세요.'); }
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('시트가 비어 있습니다.');
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const rows = raw.map(row => { const r = {}; for (const [k, v] of Object.entries(row)) r[key(k)] = v; return r; });
  const errors = [], items = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    if (Object.values(r).every(v => String(v).trim() === '')) return;
    if (kind === 'speak') {
      const text = pick(r, ['문장', '영어문장', 'sentence', 'text', '문제']);
      if (!text) return errors.push(`${line}행: '문장' 칸이 비어 있습니다.`);
      if (!/[a-zA-Z]/.test(text)) return errors.push(`${line}행: 영어 문장이 아닙니다 (${text.slice(0, 20)}).`);
      items.push({ text: text.slice(0, 200), meaning: pick(r, ['뜻', '해석', '우리말', 'meaning', 'korean']).slice(0, 200) });
    } else {
      const text = pick(r, ['문제', '질문', 'question', 'text']);
      const options = [1, 2, 3, 4, 5].map(n => pick(r, ['보기' + n, 'option' + n, '선택지' + n]).slice(0, 150));
      const rawAns = pick(r, ['정답번호', '정답', 'answer']);
      let ans = CIRCLED[rawAns] || Number(String(rawAns).replace(/[^0-9]/g, ''));
      if (!(ans >= 1 && ans <= 5)) { const byText = options.findIndex(o => o && o === rawAns); if (byText >= 0) ans = byText + 1; }
      if (!text) return errors.push(`${line}행: '문제' 칸이 비어 있습니다.`);
      if (options.some(o => !o)) return errors.push(`${line}행: 보기1~보기5를 모두 채워 주세요.`);
      if (!(ans >= 1 && ans <= 5)) return errors.push(`${line}행: 정답은 1~5 중 하나의 숫자로 적어 주세요.`);
      items.push({ text: text.slice(0, 300), options, answer: ans - 1 });
    }
  });
  if (errors.length) throw new Error(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n외 ${errors.length - 5}건` : ''));
  if (!items.length) throw new Error(kind === 'speak' ? "문장이 없습니다. 첫 줄에 '문장' 제목을 넣어 주세요." : "문제가 없습니다. 첫 줄에 '문제, 보기1~보기5, 정답' 제목을 넣어 주세요.");
  if (items.length > MAX_ROWS) throw new Error(`최대 ${MAX_ROWS}문항까지 올릴 수 있습니다.`);
  return items;
}

function templateBuffer(kind) {
  const aoa = kind === 'speak'
    ? [['문장', '뜻'], ...DEFAULT_SPEAK.map(q => [q.text, q.meaning])]
    : [['문제', '보기1', '보기2', '보기3', '보기4', '보기5', '정답'], ...DEFAULT_QUIZ.map(q => [q.text, ...q.options, q.answer + 1])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = kind === 'speak' ? [{ wch: 44 }, { wch: 34 }] : [{ wch: 46 }, { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 7 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, kind === 'speak' ? '말하기 문장' : '5지선다 문제');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
module.exports = { DEFAULT_QUIZ, DEFAULT_SPEAK, parseBank, templateBuffer, MAX_ROWS };
