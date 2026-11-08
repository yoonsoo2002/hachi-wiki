// v0.2.0의 검색 함수를 그대로 옮겨 둔 것 (비교 기준).
// 출처: public/js/model.js @ 8950528 "v0.2.0: 폴더 자유 이동, 하위 폴더, 폴더 연결"
export function searchNotesV020(state, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return state.notes
    .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .map((n) => n.id);
}
