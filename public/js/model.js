// 하치위키 데이터 모델. 화면과 저장소에 의존하지 않는 순수 함수만 둔다.
// 모든 함수는 상태를 직접 바꾸지 않고 새 상태를 돌려준다.

export const SCHEMA_VERSION = 1;
export const CARD_W = 200;
export const CARD_H = 84;
export const FOLDER_COLORS = ['blue', 'pink', 'yellow', 'mint'];
export const EDGE_KINDS = ['line', 'arrow'];

let counter = 0;
export function newId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyState() {
  return { version: SCHEMA_VERSION, notes: [], folders: [], edges: [] };
}

// ---------- 노트 ----------

export function addNote(state, { id = newId('n'), title = '새 노트', body = '', x = 0, y = 0, folderId = null } = {}) {
  const note = { id, title, body, x, y, folderId, updatedAt: Date.now() };
  return { state: { ...state, notes: [...state.notes, note] }, note };
}

export function updateNote(state, id, patch) {
  return {
    ...state,
    notes: state.notes.map((n) => (n.id === id ? { ...n, ...patch, id, updatedAt: Date.now() } : n)),
  };
}

// 규칙 4: 노트를 지우면 그 노트의 연결선도 지운다.
export function deleteNote(state, id) {
  return {
    ...state,
    notes: state.notes.filter((n) => n.id !== id),
    edges: state.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

// ---------- 폴더 ----------

export function addFolder(state, { id = newId('f'), name = '새 폴더', x = 0, y = 0, w = 480, h = 300, color } = {}) {
  const pick = color ?? FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length];
  const folder = { id, name, x, y, w, h, color: pick };
  return { state: { ...state, folders: [...state.folders, folder] }, folder };
}

export function updateFolder(state, id, patch) {
  return { ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, ...patch, id } : f)) };
}

// 폴더를 옮기면 안의 노트도 같은 만큼 옮긴다.
export function moveFolder(state, id, dx, dy) {
  return {
    ...state,
    folders: state.folders.map((f) => (f.id === id ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
    notes: state.notes.map((n) => (n.folderId === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  };
}

// 규칙 5: 폴더를 지우면 안의 노트는 폴더 밖으로 나온다. 노트는 지우지 않는다.
export function deleteFolder(state, id) {
  return {
    ...state,
    folders: state.folders.filter((f) => f.id !== id),
    notes: state.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
  };
}

// 규칙 1: 노트 하나는 폴더 하나에만 들어간다. folderId 하나로 이 규칙을 지킨다.
export function setNoteFolder(state, noteId, folderId) {
  if (folderId !== null && !state.folders.some((f) => f.id === folderId)) return state;
  return { ...state, notes: state.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n)) };
}

// 카드의 중심이 들어 있는 폴더를 찾는다. 여러 폴더가 겹치면 나중에 만든 폴더(위에 그려진 폴더)를 고른다.
export function folderAtPoint(state, x, y) {
  for (let i = state.folders.length - 1; i >= 0; i -= 1) {
    const f = state.folders[i];
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f.id;
  }
  return null;
}

// ---------- 연결선 ----------

export function hasEdgeBetween(state, a, b) {
  return state.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

// 규칙 2와 3: 같은 두 노트 사이에는 연결선이 하나뿐이다. 자기 자신과는 잇지 않는다.
export function addEdge(state, { from, to, kind = 'line', label = '', id = newId('e') }) {
  if (from === to) return { state, edge: null, reason: 'self' };
  const ids = new Set(state.notes.map((n) => n.id));
  if (!ids.has(from) || !ids.has(to)) return { state, edge: null, reason: 'missing' };
  if (hasEdgeBetween(state, from, to)) return { state, edge: null, reason: 'duplicate' };
  const edge = { id, from, to, kind: EDGE_KINDS.includes(kind) ? kind : 'line', label };
  return { state: { ...state, edges: [...state.edges, edge] }, edge, reason: null };
}

export function updateEdge(state, id, patch) {
  return { ...state, edges: state.edges.map((e) => (e.id === id ? { ...e, ...patch, id } : e)) };
}

export function deleteEdge(state, id) {
  return { ...state, edges: state.edges.filter((e) => e.id !== id) };
}

// 화살표의 방향을 뒤집는다.
export function reverseEdge(state, id) {
  return { ...state, edges: state.edges.map((e) => (e.id === id ? { ...e, from: e.to, to: e.from } : e)) };
}

// 노트 하나와 연결된 노트 목록. direction: out(이 노트 → 상대), in(상대 → 이 노트), both(선)
export function linkedNotes(state, noteId) {
  const byId = new Map(state.notes.map((n) => [n.id, n]));
  const result = [];
  for (const e of state.edges) {
    if (e.from !== noteId && e.to !== noteId) continue;
    const otherId = e.from === noteId ? e.to : e.from;
    const other = byId.get(otherId);
    if (!other) continue;
    let direction = 'both';
    if (e.kind === 'arrow') direction = e.from === noteId ? 'out' : 'in';
    result.push({ edgeId: e.id, note: other, direction, label: e.label });
  }
  return result;
}

// ---------- 검색 ----------

export function searchNotes(state, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return state.notes
    .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .map((n) => n.id);
}

// ---------- 그리기용 계산 ----------

// 사각형 중심에서 (tx, ty) 방향으로 나가는 선이 사각형 테두리와 만나는 점
export function rectEdgePoint(rect, tx, ty) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (rect.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (rect.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// ---------- 내보내기 / 가져오기 ----------

export function exportData(state) {
  return JSON.stringify({ app: 'hachi-wiki', ...state }, null, 2);
}

// 규칙 6: 내보낸 JSON을 다시 가져오면 데이터가 같다. 형식이 틀리면 오류를 던진다.
export function importData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 아니다.');
  }
  if (!data || data.app !== 'hachi-wiki') throw new Error('하치위키에서 내보낸 파일이 아니다.');
  const str = (v, d = '') => (typeof v === 'string' ? v : d);
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  const folders = (Array.isArray(data.folders) ? data.folders : [])
    .filter((f) => f && typeof f.id === 'string')
    .map((f) => ({
      id: f.id, name: str(f.name, '폴더'), x: num(f.x), y: num(f.y),
      w: num(f.w, 480), h: num(f.h, 300), color: FOLDER_COLORS.includes(f.color) ? f.color : 'blue',
    }));
  const folderIds = new Set(folders.map((f) => f.id));
  const notes = (Array.isArray(data.notes) ? data.notes : [])
    .filter((n) => n && typeof n.id === 'string')
    .map((n) => ({
      id: n.id, title: str(n.title, '제목 없음'), body: str(n.body), x: num(n.x), y: num(n.y),
      folderId: folderIds.has(n.folderId) ? n.folderId : null, updatedAt: num(n.updatedAt, Date.now()),
    }));
  let state = { version: SCHEMA_VERSION, notes, folders, edges: [] };
  for (const e of Array.isArray(data.edges) ? data.edges : []) {
    if (!e || typeof e.id !== 'string') continue;
    state = addEdge(state, { id: e.id, from: e.from, to: e.to, kind: e.kind, label: str(e.label) }).state;
  }
  return state;
}
