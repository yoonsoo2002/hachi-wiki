import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, addNote, deleteNote, addFolder, deleteFolder, moveFolder, setNoteFolder, folderAtPoint,
  addEdge, deleteEdge, reverseEdge, linkedItems, searchNotes, rectEdgePoint, exportData, importData,
  setFolderParent, descendantFolderIds, folderPath, foldersByDepth, growToFit,
} from '../public/js/model.js';
import { seedState } from '../public/js/seed.js';

function twoNotes() {
  let s = emptyState();
  const a = addNote(s, { id: 'a', title: 'A' });
  const b = addNote(a.state, { id: 'b', title: 'B' });
  return b.state;
}

test('규칙 1: 노트 하나는 폴더 하나에만 들어간다', () => {
  let s = twoNotes();
  s = addFolder(s, { id: 'f1' }).state;
  s = addFolder(s, { id: 'f2' }).state;
  s = setNoteFolder(s, 'a', 'f1');
  s = setNoteFolder(s, 'a', 'f2');
  const a = s.notes.find((n) => n.id === 'a');
  assert.equal(a.folderId, 'f2');
  assert.equal(typeof a.folderId, 'string');
});

test('없는 폴더에는 노트를 넣지 않는다', () => {
  const s = twoNotes();
  assert.equal(setNoteFolder(s, 'a', 'nope'), s);
});

test('규칙 2: 같은 두 노트 사이에는 연결선이 하나뿐이다 (방향이 달라도)', () => {
  let s = twoNotes();
  s = addEdge(s, { from: 'a', to: 'b' }).state;
  const again = addEdge(s, { from: 'b', to: 'a', kind: 'arrow' });
  assert.equal(again.edge, null);
  assert.equal(again.reason, 'duplicate');
  assert.equal(again.state.edges.length, 1);
});

test('규칙 3: 노트를 자기 자신과 연결하지 않는다', () => {
  const r = addEdge(twoNotes(), { from: 'a', to: 'a' });
  assert.equal(r.edge, null);
  assert.equal(r.reason, 'self');
});

test('없는 노트와는 연결하지 않는다', () => {
  const r = addEdge(twoNotes(), { from: 'a', to: 'ghost' });
  assert.equal(r.reason, 'missing');
});

test('규칙 4: 노트를 지우면 그 노트의 연결선도 지운다', () => {
  let s = twoNotes();
  s = addNote(s, { id: 'c' }).state;
  s = addEdge(s, { from: 'a', to: 'b' }).state;
  s = addEdge(s, { from: 'b', to: 'c' }).state;
  s = deleteNote(s, 'a');
  assert.deepEqual(s.edges.map((e) => [e.from, e.to]), [['b', 'c']]);
});

test('규칙 5: 폴더를 지우면 안의 노트는 폴더 밖으로 나온다', () => {
  let s = twoNotes();
  s = addFolder(s, { id: 'f1' }).state;
  s = setNoteFolder(s, 'a', 'f1');
  s = deleteFolder(s, 'f1');
  assert.equal(s.notes.length, 2);
  assert.equal(s.notes.find((n) => n.id === 'a').folderId, null);
});

test('규칙 6: 내보낸 JSON을 다시 가져오면 데이터가 같다', () => {
  const s = seedState();
  const back = importData(exportData(s));
  assert.deepEqual(back.notes, s.notes);
  assert.deepEqual(back.folders, s.folders);
  assert.deepEqual(back.edges, s.edges);
});

test('하치위키 파일이 아니면 가져오지 않는다', () => {
  assert.throws(() => importData('{"notes":[]}'));
  assert.throws(() => importData('not json'));
});

test('가져온 파일의 중복 연결선과 자기 연결선은 버린다', () => {
  const text = JSON.stringify({
    app: 'hachi-wiki',
    notes: [{ id: 'a', title: 'A', body: '', x: 0, y: 0 }, { id: 'b', title: 'B', body: '', x: 0, y: 0 }],
    folders: [],
    edges: [
      { id: 'e1', from: 'a', to: 'b', kind: 'line' },
      { id: 'e2', from: 'b', to: 'a', kind: 'arrow' },
      { id: 'e3', from: 'a', to: 'a', kind: 'line' },
    ],
  });
  assert.equal(importData(text).edges.length, 1);
});

test('폴더를 옮기면 안의 노트도 같이 옮겨진다', () => {
  let s = twoNotes();
  s = addFolder(s, { id: 'f1', x: 0, y: 0 }).state;
  s = setNoteFolder(s, 'a', 'f1');
  s = moveFolder(s, 'f1', 10, 20);
  const a = s.notes.find((n) => n.id === 'a');
  const b = s.notes.find((n) => n.id === 'b');
  assert.deepEqual([a.x, a.y], [10, 20]);
  assert.deepEqual([b.x, b.y], [0, 0]);
});

test('겹친 폴더에서는 위에 그려진 폴더를 고른다', () => {
  let s = emptyState();
  s = addFolder(s, { id: 'under', x: 0, y: 0, w: 100, h: 100 }).state;
  s = addFolder(s, { id: 'over', x: 50, y: 50, w: 100, h: 100 }).state;
  assert.equal(folderAtPoint(s, 75, 75), 'over');
  assert.equal(folderAtPoint(s, 10, 10), 'under');
  assert.equal(folderAtPoint(s, 500, 500), null);
});

test('연결된 목록은 화살표 방향을 알려준다', () => {
  let s = twoNotes();
  s = addNote(s, { id: 'c' }).state;
  s = addEdge(s, { from: 'a', to: 'b', kind: 'arrow' }).state;
  s = addEdge(s, { from: 'c', to: 'a', kind: 'line' }).state;
  const list = linkedItems(s, 'a');
  assert.deepEqual(list.map((l) => [l.node.id, l.direction]), [['b', 'out'], ['c', 'both']]);
  assert.deepEqual(linkedItems(s, 'b').map((l) => l.direction), ['in']);
});

// ---------- 폴더 중첩과 폴더 연결 (v0.2.0) ----------

function nested() {
  // root ⊃ mid ⊃ leaf, 노트 a는 leaf 안, b는 root 안
  let s = twoNotes();
  s = addFolder(s, { id: 'root', x: 0, y: 0, w: 600, h: 600 }).state;
  s = addFolder(s, { id: 'mid', x: 50, y: 50, w: 400, h: 400, parentId: 'root' }).state;
  s = addFolder(s, { id: 'leaf', x: 100, y: 100, w: 200, h: 200, parentId: 'mid' }).state;
  s = setNoteFolder(s, 'a', 'leaf');
  s = setNoteFolder(s, 'b', 'root');
  return s;
}

test('규칙 7: 폴더를 자기 자신이나 자기 안의 폴더에 넣지 않는다', () => {
  const s = nested();
  assert.equal(setFolderParent(s, 'root', 'root'), s);
  assert.equal(setFolderParent(s, 'root', 'leaf'), s);
  assert.equal(setFolderParent(s, 'mid', 'leaf'), s);
  const moved = setFolderParent(s, 'leaf', 'root');
  assert.equal(moved.folders.find((f) => f.id === 'leaf').parentId, 'root');
});

test('바깥 폴더를 옮기면 안의 폴더와 노트가 모두 따라온다', () => {
  let s = nested();
  s = moveFolder(s, 'root', 10, 5);
  const pos = (id) => {
    const x = s.folders.find((f) => f.id === id) || s.notes.find((n) => n.id === id);
    return [x.x, x.y];
  };
  assert.deepEqual(pos('root'), [10, 5]);
  assert.deepEqual(pos('mid'), [60, 55]);
  assert.deepEqual(pos('leaf'), [110, 105]);
  assert.deepEqual(pos('a'), [10, 5]);
  assert.deepEqual(pos('b'), [10, 5]);
});

test('규칙 5: 폴더를 지우면 안의 폴더와 노트는 한 단계 바깥으로 나온다', () => {
  let s = nested();
  s = deleteFolder(s, 'mid');
  assert.equal(s.folders.find((f) => f.id === 'leaf').parentId, 'root');
  s = deleteFolder(s, 'leaf');
  assert.equal(s.notes.find((n) => n.id === 'a').folderId, 'root');
});

test('가장 안쪽 폴더를 고르고, 끄는 폴더 자신은 고르지 않는다', () => {
  const s = nested();
  assert.equal(folderAtPoint(s, 150, 150), 'leaf');
  assert.equal(folderAtPoint(s, 60, 60), 'mid');
  const exclude = descendantFolderIds(s, 'mid');
  exclude.add('mid');
  assert.equal(folderAtPoint(s, 150, 150, exclude), 'root');
});

test('폴더 경로와 그리는 순서', () => {
  const s = nested();
  assert.deepEqual(folderPath(s, 'leaf'), ['새 폴더', '새 폴더', '새 폴더']);
  assert.deepEqual(foldersByDepth(s).map((f) => f.id), ['root', 'mid', 'leaf']);
});

test('폴더끼리, 폴더와 노트를 연결할 수 있고 폴더를 지우면 그 연결선도 지운다', () => {
  let s = nested();
  s = addFolder(s, { id: 'other' }).state;
  const r1 = addEdge(s, { from: 'root', to: 'other', kind: 'arrow' });
  assert.ok(r1.edge);
  const r2 = addEdge(r1.state, { from: 'a', to: 'other' });
  assert.ok(r2.edge);
  assert.deepEqual(linkedItems(r2.state, 'other').map((l) => l.type).sort(), ['folder', 'note']);
  s = deleteFolder(r2.state, 'other');
  assert.equal(s.edges.length, 0);
});

test('바깥 폴더는 안의 폴더와 노트를 감싸도록 넓어진다', () => {
  let s = nested();
  s = addFolder(s, { id: 'big', x: 500, y: 500, w: 400, h: 400 }).state;
  s = setFolderParent(s, 'big', 'leaf');
  s = growToFit(s, 'leaf');
  const leaf = s.folders.find((f) => f.id === 'leaf');
  const root = s.folders.find((f) => f.id === 'root');
  assert.ok(leaf.x + leaf.w >= 900 && leaf.y + leaf.h >= 900);
  assert.ok(root.x + root.w >= leaf.x + leaf.w && root.y + root.h >= leaf.y + leaf.h);
});

test('가져온 파일의 순환 폴더는 맨 바깥으로 꺼낸다', () => {
  const text = JSON.stringify({
    app: 'hachi-wiki', notes: [], edges: [],
    folders: [
      { id: 'x', name: 'X', x: 0, y: 0, w: 10, h: 10, color: 'blue', parentId: 'y' },
      { id: 'y', name: 'Y', x: 0, y: 0, w: 10, h: 10, color: 'blue', parentId: 'x' },
    ],
  });
  const s = importData(text);
  assert.ok(s.folders.some((f) => f.parentId === null));
});

test('화살표 방향을 뒤집고 연결선을 지운다', () => {
  let s = twoNotes();
  const r = addEdge(s, { from: 'a', to: 'b', kind: 'arrow' });
  s = reverseEdge(r.state, r.edge.id);
  assert.deepEqual([s.edges[0].from, s.edges[0].to], ['b', 'a']);
  s = deleteEdge(s, r.edge.id);
  assert.equal(s.edges.length, 0);
});

test('검색은 제목과 본문에서 대소문자 없이 찾는다', () => {
  const s = seedState();
  assert.deepEqual(searchNotes(s, 'vercel'), ['n_vercel']);
  assert.ok(searchNotes(s, 'GIT').includes('n_git'));
  assert.deepEqual(searchNotes(s, '   '), []);
});

test('연결선 끝점은 카드 테두리 위에 있다', () => {
  const rect = { x: 0, y: 0, w: 200, h: 80 };
  assert.deepEqual(rectEdgePoint(rect, 1000, 40), { x: 200, y: 40 });
  assert.deepEqual(rectEdgePoint(rect, 100, -1000), { x: 100, y: 0 });
});
