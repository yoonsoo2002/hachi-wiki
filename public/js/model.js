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

export function addFolder(state, { id = newId('f'), name = '새 폴더', x = 0, y = 0, w = 480, h = 300, color, parentId = null } = {}) {
  const pick = color ?? FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length];
  const folder = { id, name, x, y, w, h, color: pick, parentId };
  return { state: { ...state, folders: [...state.folders, folder] }, folder };
}

export function updateFolder(state, id, patch) {
  return { ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, ...patch, id } : f)) };
}

// 폴더 안의 폴더를 모두 찾는다 (자식, 손자, ...). 자기 자신은 넣지 않는다.
export function descendantFolderIds(state, id) {
  const result = new Set();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const f of state.folders) {
      if (f.parentId === cur && !result.has(f.id) && f.id !== id) {
        result.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}

// 폴더가 몇 겹 안에 들어 있는지 센다. 맨 바깥 폴더는 0이다.
export function folderDepth(state, id) {
  const byId = new Map(state.folders.map((f) => [f.id, f]));
  let depth = 0;
  let cur = byId.get(id);
  const seen = new Set();
  while (cur && cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
    if (cur) depth += 1;
  }
  return depth;
}

// 바깥 폴더부터 안쪽 폴더까지 이름 목록. 예: ['DevOps', '자동화']
export function folderPath(state, id) {
  const byId = new Map(state.folders.map((f) => [f.id, f]));
  const path = [];
  const seen = new Set();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur.name);
    cur = byId.get(cur.parentId);
  }
  return path;
}

// 폴더를 옮기면 안의 폴더와 노트도 모두 같은 만큼 옮긴다.
export function moveFolder(state, id, dx, dy) {
  const ids = descendantFolderIds(state, id);
  ids.add(id);
  return {
    ...state,
    folders: state.folders.map((f) => (ids.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
    notes: state.notes.map((n) => (ids.has(n.folderId) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  };
}

// 규칙 7: 폴더를 다른 폴더 안에 넣는다. 자기 자신이나 자기 안의 폴더에는 넣지 않는다 (순환 금지).
export function setFolderParent(state, id, parentId) {
  if (parentId === id) return state;
  if (parentId !== null) {
    if (!state.folders.some((f) => f.id === parentId)) return state;
    if (descendantFolderIds(state, id).has(parentId)) return state;
  }
  return updateFolder(state, id, { parentId });
}

// 폴더가 안의 노트와 폴더를 모두 감싸도록 넓힌다. 바깥 폴더들도 차례로 넓힌다. 줄이지는 않는다.
export function growToFit(state, folderId, pad = 20, padTop = 44) {
  let s = state;
  let id = folderId;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const f = s.folders.find((x) => x.id === id);
    if (!f) break;
    const boxes = [
      ...s.notes.filter((n) => n.folderId === id).map((n) => ({ x: n.x, y: n.y, w: CARD_W, h: CARD_H })),
      ...s.folders.filter((c) => c.parentId === id),
    ];
    if (boxes.length) {
      const x0 = Math.min(f.x, ...boxes.map((b) => b.x - pad));
      const y0 = Math.min(f.y, ...boxes.map((b) => b.y - padTop));
      const x1 = Math.max(f.x + f.w, ...boxes.map((b) => b.x + b.w + pad));
      const y1 = Math.max(f.y + f.h, ...boxes.map((b) => b.y + b.h + pad));
      s = updateFolder(s, id, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    id = f.parentId;
  }
  return s;
}

// 규칙 5: 폴더를 지우면 안의 노트와 폴더는 한 단계 바깥으로 나온다. 노트는 지우지 않는다.
// 폴더에 이어진 연결선은 함께 지운다.
export function deleteFolder(state, id) {
  const target = state.folders.find((f) => f.id === id);
  const up = target ? target.parentId ?? null : null;
  return {
    ...state,
    folders: state.folders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: up } : f)),
    notes: state.notes.map((n) => (n.folderId === id ? { ...n, folderId: up } : n)),
    edges: state.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

// 규칙 1: 노트 하나는 폴더 하나에만 들어간다. folderId 하나로 이 규칙을 지킨다.
export function setNoteFolder(state, noteId, folderId) {
  if (folderId !== null && !state.folders.some((f) => f.id === folderId)) return state;
  return { ...state, notes: state.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n)) };
}

// 점 (x, y)가 들어 있는 폴더 중 가장 안쪽 폴더를 찾는다. 깊이가 같으면 나중에 만든 폴더를 고른다.
// exclude에 든 폴더는 고르지 않는다 (폴더를 끌 때 자기 자신과 자기 안의 폴더를 뺀다).
export function folderAtPoint(state, x, y, exclude = new Set()) {
  let best = null;
  let bestDepth = -1;
  for (const f of state.folders) {
    if (exclude.has(f.id)) continue;
    if (x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) continue;
    const depth = folderDepth(state, f.id);
    if (depth >= bestDepth) {
      best = f.id;
      bestDepth = depth;
    }
  }
  return best;
}

// 그리는 순서: 바깥 폴더를 먼저, 안쪽 폴더를 나중에 그린다.
export function foldersByDepth(state) {
  return state.folders
    .map((f, i) => ({ f, i, d: folderDepth(state, f.id) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.f);
}

// ---------- 연결선 ----------

export function hasEdgeBetween(state, a, b) {
  return state.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

// 연결선은 노트와 노트, 폴더와 폴더, 노트와 폴더를 모두 이을 수 있다.
export function nodeIds(state) {
  return new Set([...state.notes.map((n) => n.id), ...state.folders.map((f) => f.id)]);
}

// 규칙 2와 3: 같은 두 대상 사이에는 연결선이 하나뿐이다. 자기 자신과는 잇지 않는다.
export function addEdge(state, { from, to, kind = 'line', label = '', id = newId('e') }) {
  if (from === to) return { state, edge: null, reason: 'self' };
  const ids = nodeIds(state);
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

// 노트나 폴더 하나와 연결된 대상 목록.
// type: note | folder, direction: out(이쪽 → 상대), in(상대 → 이쪽), both(선)
export function linkedItems(state, id) {
  const byId = new Map([
    ...state.notes.map((n) => [n.id, { type: 'note', node: n }]),
    ...state.folders.map((f) => [f.id, { type: 'folder', node: f }]),
  ]);
  const result = [];
  for (const e of state.edges) {
    if (e.from !== id && e.to !== id) continue;
    const other = byId.get(e.from === id ? e.to : e.from);
    if (!other) continue;
    let direction = 'both';
    if (e.kind === 'arrow') direction = e.from === id ? 'out' : 'in';
    result.push({ edgeId: e.id, ...other, direction, label: e.label });
  }
  return result;
}

// ---------- 검색 (v0.3.0) ----------
// v0.2.0은 입력한 글자가 그대로 들어 있어야만 찾았다. v0.3.0은
//  1) 띄어쓰기·기호·대소문자를 무시하고 ("가상메모리" = "가상 메모리", "p값" = "p-값")
//  2) 여러 단어는 떨어져 있어도 모두 들어 있으면 찾고 ("push 배포")
//  3) 한글 초성으로도 찾고 ("ㅂㄹㅊ" = "브랜치")
//  4) 제목에서 찾은 노트를 앞에 놓는다 (Enter를 누르면 맨 앞 노트가 열린다).

// 초성 표. 비교는 모두 NFKC로 정규화한 글자로 한다 (호환 자모 ㄱ과 조합용 자모 ᄀ을 같게 본다).
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
  .map((c) => c.normalize('NFKC'));
const CHOSEONG_SET = new Set(CHOSEONG);

// 비교용 글자만 남긴다: 정규화(NFKC), 소문자, 글자·숫자 말고는 모두 지운다.
export function compactText(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// 한글 음절을 초성으로 바꾼다. 한글이 아닌 글자는 그대로 둔다.
export function toChoseong(compact) {
  let out = '';
  for (const ch of compact) {
    const code = ch.charCodeAt(0);
    out += code >= 0xac00 && code <= 0xd7a3 ? CHOSEONG[Math.floor((code - 0xac00) / 588)] : ch;
  }
  return out;
}

function isChoseongOnly(token) {
  return [...token].every((ch) => CHOSEONG_SET.has(ch));
}

const TITLE_SCORE = 3;
const BODY_SCORE = 1;

export function searchNotes(state, query) {
  const tokens = String(query ?? '').split(/\s+/).map(compactText).filter(Boolean);
  if (!tokens.length) return [];
  const whole = tokens.join('');

  const found = [];
  state.notes.forEach((note, order) => {
    const title = compactText(note.title);
    const body = compactText(note.body);
    let titleCho = null;
    let bodyCho = null;
    let score = 0;
    for (const token of tokens) {
      let inTitle;
      let inBody;
      if (isChoseongOnly(token)) {
        titleCho ??= toChoseong(title);
        bodyCho ??= toChoseong(body);
        inTitle = titleCho.includes(token);
        inBody = bodyCho.includes(token);
      } else {
        inTitle = title.includes(token);
        inBody = body.includes(token);
      }
      if (!inTitle && !inBody) return; // 모든 단어가 들어 있어야 한다
      score += inTitle ? TITLE_SCORE : BODY_SCORE;
    }
    if (tokens.length > 1 && (title.includes(whole) || body.includes(whole))) score += 2; // 붙어 있으면 가산점
    if (title.startsWith(whole)) score += 1;
    found.push({ id: note.id, score, order });
  });

  found.sort((a, b) => b.score - a.score || a.order - b.order);
  return found.map((f) => f.id);
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
  const rawFolders = (Array.isArray(data.folders) ? data.folders : []).filter((f) => f && typeof f.id === 'string');
  const folderIds = new Set(rawFolders.map((f) => f.id));
  let folders = rawFolders.map((f) => ({
    id: f.id, name: str(f.name, '폴더'), x: num(f.x), y: num(f.y),
    w: num(f.w, 480), h: num(f.h, 300), color: FOLDER_COLORS.includes(f.color) ? f.color : 'blue',
    parentId: folderIds.has(f.parentId) && f.parentId !== f.id ? f.parentId : null,
  }));
  // 부모를 따라가다 자기 자신으로 돌아오는 폴더(순환)는 맨 바깥으로 꺼낸다.
  const byId = new Map(folders.map((f) => [f.id, f]));
  folders = folders.map((f) => {
    const seen = new Set([f.id]);
    let cur = byId.get(f.parentId);
    while (cur) {
      if (seen.has(cur.id)) return { ...f, parentId: null };
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
    return f;
  });
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
