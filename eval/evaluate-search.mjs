// 검색 평가: 같은 노트 30개, 같은 질의, 같은 지표로 v0.2.0 검색과 현재 검색을 비교한다.
//   node eval/evaluate-search.mjs --split tune   (개선 작업 중: 튜닝 질의 30개만)
//   node eval/evaluate-search.mjs --split test   (최종 비교: 평가 질의 70개만, 튜닝에 쓰지 않음)
// 지표
//   Hit@1   : 첫 번째 결과(Enter를 누르면 열리는 노트)가 정답인 비율
//   Recall  : 정답 노트가 결과 목록 안에 있는 비율
//   MRR     : 정답이 몇 번째에 나오는지 (1위=1, 2위=0.5, 없으면 0)의 평균
//   결과 없음: 결과가 하나도 안 나온 질의 비율
import { readFileSync } from 'node:fs';
import { searchNotes } from '../public/js/model.js';
import { searchNotesV020 } from './baseline-search.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const split = arg('--split', 'test');
const showMiss = process.argv.includes('--miss');

const corpus = JSON.parse(readFileSync(new URL('./search-corpus.json', import.meta.url), 'utf8'));
const { queries } = JSON.parse(readFileSync(new URL('./search-queries.json', import.meta.url), 'utf8'));
const state = { notes: corpus.notes.map((n) => ({ ...n, folderId: null, x: 0, y: 0 })), folders: [], edges: [] };
const picked = queries.filter((q) => split === 'all' || q.split === split);

function score(fn) {
  const rows = picked.map((q) => {
    const ids = fn(state, q.q);
    const ranks = q.relevant.map((r) => ids.indexOf(r)).filter((i) => i >= 0);
    const best = ranks.length ? Math.min(...ranks) : -1;
    return {
      q, ids,
      hit1: ids.length > 0 && q.relevant.includes(ids[0]) ? 1 : 0,
      recall: ranks.length / q.relevant.length,
      rr: best >= 0 ? 1 / (best + 1) : 0,
      empty: ids.length === 0 ? 1 : 0,
      // 결과가 있을 때만 계산: 나온 결과 중 정답 비율 (엉뚱한 노트가 딸려 나오면 낮아진다)
      precision: ids.length ? ranks.length / ids.length : null,
      count: ids.length,
    };
  });
  const agg = (list) => {
    const n = list.length || 1;
    const sum = (k) => list.reduce((s, r) => s + r[k], 0);
    const withResults = list.filter((r) => r.precision !== null);
    return {
      n: list.length, hit1: sum('hit1') / n, recall: sum('recall') / n, mrr: sum('rr') / n, empty: sum('empty') / n,
      precision: withResults.length ? withResults.reduce((s, r) => s + r.precision, 0) / withResults.length : 0,
      count: sum('count') / n,
    };
  };
  const byType = {};
  for (const r of rows) (byType[r.q.type] ||= []).push(r);
  return { all: agg(rows), byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, agg(v)])), rows };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const before = score(searchNotesV020);
const after = score(searchNotes);

console.log(`## 검색 평가 (split: ${split}, 질의 ${picked.length}개, 노트 ${state.notes.length}개)\n`);
console.log('| 지표 | v0.2.0 | 현재 | 변화 |');
console.log('|---|---:|---:|---:|');
for (const [k, label] of [['hit1', 'Hit@1 (첫 결과가 정답)'], ['recall', 'Recall (정답을 찾음)'], ['mrr', 'MRR'], ['empty', '결과 없음 비율 (낮을수록 좋음)']]) {
  const d = after.all[k] - before.all[k];
  console.log(`| ${label} | ${pct(before.all[k])} | ${pct(after.all[k])} | ${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%p |`);
}
console.log(`| 정밀도 (결과가 나온 질의에서, 결과 중 정답 비율) | ${pct(before.all.precision)} | ${pct(after.all.precision)} | ${((after.all.precision - before.all.precision) * 100).toFixed(1)}%p |`);
console.log(`| 질의당 평균 결과 수 | ${before.all.count.toFixed(2)} | ${after.all.count.toFixed(2)} | |`);
console.log('\n| 질의 유형 | 개수 | Hit@1 v0.2.0 → 현재 | Recall v0.2.0 → 현재 |');
console.log('|---|---:|---:|---:|');
const names = { exact: '정확한 단어', spacing: '띄어쓰기 차이', multi: '떨어진 여러 단어', choseong: '초성', case: '영문 대소문자·기호' };
for (const t of Object.keys(names)) {
  const b = before.byType[t];
  const a = after.byType[t];
  if (!b) continue;
  console.log(`| ${names[t]} | ${b.n} | ${pct(b.hit1)} → ${pct(a.hit1)} | ${pct(b.recall)} → ${pct(a.recall)} |`);
}

if (showMiss) {
  console.log('\n현재 검색이 틀린 질의:');
  for (const r of after.rows) if (!r.hit1) console.log(`- ${r.q.id} [${r.q.type}] "${r.q.q}" 정답 ${r.q.relevant.join(',')} / 결과 ${r.ids.slice(0, 5).join(',') || '(없음)'}`);
}
