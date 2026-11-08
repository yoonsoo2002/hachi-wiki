// 하치위키 화면 동작: 편집 영역, 캔버스(카드·폴더·연결선), 하치와레 말풍선
import {
  CARD_W, CARD_H, emptyState, addNote, updateNote, deleteNote, addFolder, updateFolder, moveFolder,
  deleteFolder, setNoteFolder, folderAtPoint, addEdge, updateEdge, deleteEdge, reverseEdge,
  linkedItems, searchNotes, rectEdgePoint, exportData, importData,
  setFolderParent, descendantFolderIds, folderPath, foldersByDepth, growToFit,
} from './model.js';
import { renderMarkdown, firstLine } from './markdown.js';
import { hachiLine } from './hachi.js';
import { seedState } from './seed.js';
import { loadState, saveState } from './store.js';

const $ = (id) => document.getElementById(id);
const el = {
  layout: $('layout'), viewport: $('viewport'), world: $('world'),
  folderLayer: $('folderLayer'), edgeGroup: $('edgeGroup'), tempEdge: $('tempEdge'),
  labelLayer: $('labelLayer'), cardLayer: $('cardLayer'),
  zoomText: $('zoomText'), edgeTools: $('edgeTools'), edgeLabel: $('edgeLabel'),
  edgeKind: $('edgeKind'), edgeFlip: $('edgeFlip'), edgeDelete: $('edgeDelete'),
  bubble: $('bubble'), search: $('search'), searchCount: $('searchCount'),
  editorEmpty: $('editorEmpty'), editorBody: $('editorBody'), noteTitle: $('noteTitle'),
  noteBody: $('noteBody'), notePreview: $('notePreview'), saveStateText: $('saveState'),
  viewEdit: $('viewEdit'), viewPreview: $('viewPreview'),
  linkedFolder: $('linkedFolder'), linkedList: $('linkedList'),
  modeLine: $('modeLine'), modeArrow: $('modeArrow'), fileImport: $('fileImport'),
  versionText: $('versionText'), healthText: $('healthText'),
};
const SVG_NS = 'http://www.w3.org/2000/svg';
const narrow = window.matchMedia('(max-width: 899px)');

let state = emptyState();
let selectedNoteId = null;
let selectedEdgeId = null;
let edgeMode = 'line';
let previewMode = false;
let searchIds = null;
const view = { x: 40, y: 40, z: 1 };

const getNote = (id) => state.notes.find((n) => n.id === id);
const getFolder = (id) => state.folders.find((f) => f.id === id);
const getEdge = (id) => state.edges.find((e) => e.id === id);
const noteRect = (n) => ({ x: n.x, y: n.y, w: CARD_W, h: CARD_H });
// 연결선의 끝은 노트 카드일 수도, 폴더일 수도 있다.
const nodeRect = (id) => {
  const n = getNote(id);
  if (n) return noteRect(n);
  const f = getFolder(id);
  return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- 저장 ----------

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  el.saveStateText.textContent = '저장 중…';
  saveTimer = setTimeout(async () => {
    await saveState(state);
    el.saveStateText.textContent = '자동 저장됨';
  }, 300);
}

function commit(next) {
  state = next;
  persist();
  render();
}

// ---------- 하치와레 말풍선 ----------

let bubbleTimer = null;
let bubbleToken = 0;
function say(event, vars) {
  const text = hachiLine(event, vars);
  if (!text) return;
  const token = ++bubbleToken;
  el.bubble.textContent = text;
  el.bubble.hidden = false;
  el.bubble.classList.remove('leaving');
  el.bubble.style.animation = 'none';
  void el.bubble.offsetWidth;
  el.bubble.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    el.bubble.classList.add('leaving');
    setTimeout(() => {
      if (token !== bubbleToken) return;
      el.bubble.hidden = true;
      el.bubble.classList.remove('leaving');
    }, 300);
  }, 5000);
}

// ---------- 화면 이동과 확대 ----------

function applyView() {
  el.world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  el.world.style.setProperty('--hit', String(18 / view.z));
  el.viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
  el.viewport.style.backgroundSize = `${22 * view.z}px ${22 * view.z}px`;
  el.zoomText.textContent = `${Math.round(view.z * 100)}%`;
  positionEdgeTools();
}

function toWorld(clientX, clientY) {
  const r = el.viewport.getBoundingClientRect();
  return { x: (clientX - r.left - view.x) / view.z, y: (clientY - r.top - view.y) / view.z };
}

function zoomAt(clientX, clientY, factor) {
  const r = el.viewport.getBoundingClientRect();
  const z = clamp(view.z * factor, 0.3, 2);
  const wx = (clientX - r.left - view.x) / view.z;
  const wy = (clientY - r.top - view.y) / view.z;
  view.x = clientX - r.left - wx * z;
  view.y = clientY - r.top - wy * z;
  view.z = z;
  applyView();
}

function zoomCenter(factor) {
  const r = el.viewport.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}

function fitView() {
  const r = el.viewport.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const boxes = [...state.notes.map(noteRect), ...state.folders];
  if (!boxes.length) {
    Object.assign(view, { x: 40, y: 40, z: 1 });
    applyView();
    return;
  }
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = 48;
  const z = clamp(Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY)), 0.3, 1.1);
  view.z = z;
  view.x = (r.width - (maxX - minX) * z) / 2 - minX * z;
  view.y = (r.height - (maxY - minY) * z) / 2 - minY * z;
  applyView();
}

function centerOnBox(b) {
  const r = el.viewport.getBoundingClientRect();
  view.x = r.width / 2 - (b.x + b.w / 2) * view.z;
  view.y = r.height / 2 - (b.y + b.h / 2) * view.z;
  applyView();
}

function centerOn(note) {
  centerOnBox(noteRect(note));
}

function viewCenterWorld() {
  const r = el.viewport.getBoundingClientRect();
  return toWorld(r.left + r.width / 2, r.top + r.height / 2);
}

// ---------- 그리기 ----------

function setBox(node, b) {
  node.style.left = `${b.x}px`;
  node.style.top = `${b.y}px`;
  node.style.width = `${b.w}px`;
  node.style.height = `${b.h}px`;
}

function renderFolders() {
  // 바깥 폴더를 먼저 그려야 안쪽 폴더가 그 위에 보인다.
  el.folderLayer.replaceChildren(...foldersByDepth(state).map((f) => {
    const d = document.createElement('div');
    d.className = `folder ${f.color}`;
    d.dataset.id = f.id;
    setBox(d, f);
    d.innerHTML = '<div class="folder-head"><input class="folder-name" readonly aria-label="폴더 이름" title="눌러서 이름 바꾸기"><span class="folder-count"></span><button class="folder-del" type="button">삭제</button></div><div class="handle folder-handle" title="끌어서 다른 폴더나 카드와 연결"></div><div class="folder-resize" title="끌어서 크기 조절"></div>';
    d.querySelector('.folder-name').value = f.name;
    const notes = state.notes.filter((n) => n.folderId === f.id).length;
    const subs = state.folders.filter((x) => x.parentId === f.id).length;
    d.querySelector('.folder-count').textContent = subs ? `노트 ${notes} · 폴더 ${subs}` : `노트 ${notes}`;
    return d;
  }));
}

function renderCards() {
  const matches = searchIds ? new Set(searchIds) : null;
  el.cardLayer.replaceChildren(...state.notes.map((n) => {
    const c = document.createElement('div');
    c.className = 'card';
    if (n.id === selectedNoteId) c.classList.add('selected');
    if (matches) c.classList.add(matches.has(n.id) ? 'match' : 'dim');
    c.dataset.id = n.id;
    setBox(c, noteRect(n));
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = n.title || '제목 없음';
    const sub = document.createElement('div');
    sub.className = 'card-sub';
    sub.textContent = firstLine(n.body) || '(빈 노트)';
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.title = '끌어서 다른 카드와 연결';
    c.append(title, sub, handle);
    return c;
  }));
}

function edgePoints(e) {
  const ra = nodeRect(e.from);
  const rb = nodeRect(e.to);
  if (!ra || !rb) return null;
  const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
  const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
  return { p1: rectEdgePoint(ra, cb.x, cb.y), p2: rectEdgePoint(rb, ca.x, ca.y) };
}

function renderEdges() {
  const groups = [];
  const labels = [];
  for (const e of state.edges) {
    const pts = edgePoints(e);
    if (!pts) continue;
    const on = e.id === selectedEdgeId;
    const d = `M${pts.p1.x} ${pts.p1.y}L${pts.p2.x} ${pts.p2.y}`;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'edge-g');
    g.dataset.id = e.id;
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', d);
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', on ? 'edge-line on' : 'edge-line');
    line.setAttribute('d', d);
    if (e.kind === 'arrow') line.setAttribute('marker-end', on ? 'url(#arrowOn)' : 'url(#arrow)');
    g.append(hit, line);
    groups.push(g);
    if (e.label) {
      const lab = document.createElement('div');
      lab.className = on ? 'edge-label on' : 'edge-label';
      lab.dataset.id = e.id;
      lab.textContent = e.label;
      lab.style.left = `${(pts.p1.x + pts.p2.x) / 2}px`;
      lab.style.top = `${(pts.p1.y + pts.p2.y) / 2}px`;
      labels.push(lab);
    }
  }
  el.edgeGroup.replaceChildren(...groups);
  el.labelLayer.replaceChildren(...labels);
}

// 끌기 중에는 DOM을 다시 만들지 않고 위치만 바꾼다.
function renderPositions() {
  for (const node of el.cardLayer.children) {
    const n = getNote(node.dataset.id);
    if (n) setBox(node, noteRect(n));
  }
  for (const node of el.folderLayer.children) {
    const f = getFolder(node.dataset.id);
    if (f) setBox(node, f);
  }
  renderEdges();
}

function render() {
  renderFolders();
  renderCards();
  renderEdges();
  renderEditor();
  positionEdgeTools();
}

// ---------- 편집 영역 ----------

let editorNoteId = null;
function renderEditor() {
  const note = getNote(selectedNoteId);
  el.editorEmpty.hidden = !!note;
  el.editorBody.hidden = !note;
  if (!note) {
    editorNoteId = null;
    return;
  }
  if (editorNoteId !== note.id) {
    el.noteTitle.value = note.title;
    el.noteBody.value = note.body;
    editorNoteId = note.id;
  }
  el.noteBody.hidden = previewMode;
  el.notePreview.hidden = !previewMode;
  if (previewMode) el.notePreview.innerHTML = renderMarkdown(note.body) || '<p>(빈 노트)</p>';
  el.viewEdit.classList.toggle('on', !previewMode);
  el.viewPreview.classList.toggle('on', previewMode);
  el.viewEdit.setAttribute('aria-pressed', String(!previewMode));
  el.viewPreview.setAttribute('aria-pressed', String(previewMode));
  renderLinked(note);
}

function renderLinked(note) {
  el.linkedFolder.textContent = note.folderId ? `폴더: ${folderPath(state, note.folderId).join(' › ')}` : '폴더: 없음';
  const items = linkedItems(state, note.id);
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'linked-none';
    li.textContent = '아직 연결이 없다. 카드의 파란 점을 끌어 다른 카드에 놓는다.';
    el.linkedList.replaceChildren(li);
    return;
  }
  el.linkedList.replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const dir = document.createElement('span');
    dir.className = 'linked-dir';
    dir.textContent = { out: '→', in: '←', both: '—' }[it.direction];
    dir.title = { out: '이 노트에서 나가는 화살표', in: '이 노트로 들어오는 화살표', both: '선' }[it.direction];
    const t = document.createElement('span');
    t.textContent = it.type === 'folder' ? `[폴더] ${it.node.name}` : it.node.title || '제목 없음';
    b.append(dir, t);
    if (it.label) {
      const l = document.createElement('span');
      l.className = 'linked-label';
      l.textContent = it.label;
      b.append(l);
    }
    b.addEventListener('click', () => {
      if (it.type === 'note') selectNote(it.node.id, { center: true });
      else centerOnBox(it.node);
    });
    li.append(b);
    return li;
  }));
}

function selectNote(id, { center = false, openEditor = false } = {}) {
  selectedNoteId = id;
  selectEdge(null);
  render();
  const note = getNote(id);
  if (note && center) centerOn(note);
  if (openEditor && narrow.matches) setView('editor');
}

function onEditorInput() {
  if (!selectedNoteId) return;
  state = updateNote(state, selectedNoteId, { title: el.noteTitle.value, body: el.noteBody.value });
  persist();
  renderCards();
}
el.noteTitle.addEventListener('input', onEditorInput);
el.noteBody.addEventListener('input', onEditorInput);

$('btnSave').addEventListener('click', async () => {
  clearTimeout(saveTimer);
  await saveState(state);
  el.saveStateText.textContent = '저장했다';
  say('save');
});

$('btnDelete').addEventListener('click', () => {
  const note = getNote(selectedNoteId);
  if (!note) return;
  if (!confirm(`'${note.title || '제목 없음'}' 노트를 지울까? 이 노트의 연결선도 함께 지워진다.`)) return;
  selectedNoteId = null;
  commit(deleteNote(state, note.id));
  say('delete');
});

el.viewEdit.addEventListener('click', () => { previewMode = false; renderEditor(); });
el.viewPreview.addEventListener('click', () => { previewMode = true; renderEditor(); });

// ---------- 연결선 도구 ----------

function selectEdge(id) {
  selectedEdgeId = id;
  const e = getEdge(id);
  if (e) {
    el.edgeLabel.value = e.label;
    el.edgeKind.textContent = e.kind === 'arrow' ? '선으로' : '화살표로';
    el.edgeFlip.disabled = e.kind !== 'arrow';
  }
  renderEdges();
  positionEdgeTools();
}

function positionEdgeTools() {
  const e = getEdge(selectedEdgeId);
  const pts = e && edgePoints(e);
  if (!pts) {
    el.edgeTools.hidden = true;
    return;
  }
  el.edgeTools.hidden = false;
  // 도구 모음이 캔버스 밖으로 나가지 않게 위치를 제한한다.
  const wrap = el.edgeTools.parentElement.getBoundingClientRect();
  const tw = el.edgeTools.offsetWidth;
  const th = el.edgeTools.offsetHeight;
  const x = view.x + ((pts.p1.x + pts.p2.x) / 2) * view.z;
  const y = view.y + ((pts.p1.y + pts.p2.y) / 2) * view.z;
  el.edgeTools.style.left = `${clamp(x, tw / 2 + 8, wrap.width - tw / 2 - 8)}px`;
  el.edgeTools.style.top = `${clamp(y, th * 1.3 + 8, wrap.height - 8)}px`;
}

el.edgeLabel.addEventListener('input', () => {
  if (!selectedEdgeId) return;
  state = updateEdge(state, selectedEdgeId, { label: el.edgeLabel.value.trim() });
  persist();
  renderEdges();
});
el.edgeKind.addEventListener('click', () => {
  const e = getEdge(selectedEdgeId);
  if (!e) return;
  commit(updateEdge(state, e.id, { kind: e.kind === 'arrow' ? 'line' : 'arrow' }));
  selectEdge(e.id);
});
el.edgeFlip.addEventListener('click', () => {
  if (!selectedEdgeId) return;
  commit(reverseEdge(state, selectedEdgeId));
});
el.edgeDelete.addEventListener('click', () => {
  if (!selectedEdgeId) return;
  const id = selectedEdgeId;
  selectedEdgeId = null;
  commit(deleteEdge(state, id));
});

// ---------- 캔버스 끌기 ----------

let drag = null;

function clearDropHighlight() {
  for (const f of el.folderLayer.querySelectorAll('.folder.drop')) f.classList.remove('drop');
}
function clearConnectTarget() {
  for (const c of el.world.querySelectorAll('.connect-target')) c.classList.remove('connect-target');
}
// 연결할 대상: 카드가 위에 있으면 카드, 없으면 폴더
function nodeUnderPointer(ev) {
  const hit = document.elementFromPoint(ev.clientX, ev.clientY);
  return hit ? hit.closest('.card') || hit.closest('.folder') : null;
}
// 폴더를 끌 때는 자기 자신과 자기 안의 폴더에는 넣을 수 없다.
function folderDropExclude(id) {
  const ex = descendantFolderIds(state, id);
  ex.add(id);
  return ex;
}

el.viewport.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const t = ev.target;
  if (t.closest('.folder-del')) return;
  const nameInput = t.closest('.folder-name');
  if (nameInput && !nameInput.readOnly) return;

  const p = toWorld(ev.clientX, ev.clientY);
  const card = t.closest('.card');
  const handle = t.closest('.handle');
  const folderEl = t.closest('.folder');
  const edgeEl = t.closest('.edge-g') || t.closest('.edge-label');
  const base = { sx: ev.clientX, sy: ev.clientY, moved: false };

  if (handle && (card || folderEl)) {
    drag = { ...base, type: 'connect', from: (card || folderEl).dataset.id };
  } else if (card) {
    const n = getNote(card.dataset.id);
    drag = { ...base, type: 'card', id: n.id, ox: n.x - p.x, oy: n.y - p.y, el: card };
  } else if (edgeEl) {
    selectEdge(edgeEl.dataset.id);
    return;
  } else if (folderEl && t.closest('.folder-resize')) {
    const f = getFolder(folderEl.dataset.id);
    drag = { ...base, type: 'resize', id: f.id, px: p.x, py: p.y, w: f.w, h: f.h };
  } else if (folderEl) {
    // 폴더의 빈 곳 어디를 끌어도 폴더가 움직인다.
    drag = { ...base, type: 'folder', id: folderEl.dataset.id, lx: p.x, ly: p.y, onName: !!nameInput, el: folderEl };
  } else {
    drag = { ...base, type: 'pan', vx: view.x, vy: view.y };
    el.viewport.classList.add('panning');
  }
  el.viewport.setPointerCapture(ev.pointerId);
});

el.viewport.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 4) return;
  drag.moved = true;
  const p = toWorld(ev.clientX, ev.clientY);

  if (drag.type === 'pan') {
    view.x = drag.vx + (ev.clientX - drag.sx);
    view.y = drag.vy + (ev.clientY - drag.sy);
    applyView();
  } else if (drag.type === 'card') {
    drag.el.classList.add('dragging');
    const x = Math.round(p.x + drag.ox);
    const y = Math.round(p.y + drag.oy);
    state = { ...state, notes: state.notes.map((n) => (n.id === drag.id ? { ...n, x, y } : n)) };
    setBox(drag.el, { x, y, w: CARD_W, h: CARD_H });
    renderEdges();
    positionEdgeTools();
    const fid = folderAtPoint(state, x + CARD_W / 2, y + CARD_H / 2);
    for (const f of el.folderLayer.children) f.classList.toggle('drop', f.dataset.id === fid);
  } else if (drag.type === 'folder') {
    drag.el.classList.add('dragging');
    state = moveFolder(state, drag.id, p.x - drag.lx, p.y - drag.ly);
    drag.lx = p.x;
    drag.ly = p.y;
    renderPositions();
    positionEdgeTools();
    const f = getFolder(drag.id);
    const target = folderAtPoint(state, f.x + f.w / 2, f.y + f.h / 2, folderDropExclude(drag.id));
    for (const node of el.folderLayer.children) node.classList.toggle('drop', node.dataset.id === target);
  } else if (drag.type === 'resize') {
    state = updateFolder(state, drag.id, {
      w: Math.round(Math.max(240, drag.w + p.x - drag.px)),
      h: Math.round(Math.max(160, drag.h + p.y - drag.py)),
    });
    renderPositions();
  } else if (drag.type === 'connect') {
    const from = nodeRect(drag.from);
    el.tempEdge.setAttribute('d', `M${from.x + from.w / 2} ${from.y + from.h / 2}L${p.x} ${p.y}`);
    clearConnectTarget();
    const target = nodeUnderPointer(ev);
    if (target && target.dataset.id !== drag.from) target.classList.add('connect-target');
  }
});

function endDrag(ev, cancelled) {
  if (!drag) return;
  const d = drag;
  drag = null;
  el.viewport.classList.remove('panning');
  clearDropHighlight();
  clearConnectTarget();
  el.tempEdge.setAttribute('d', '');

  if (d.type === 'card') {
    d.el.classList.remove('dragging');
    if (!d.moved) {
      selectNote(d.id, { openEditor: true });
      return;
    }
    const n = getNote(d.id);
    const fid = folderAtPoint(state, n.x + CARD_W / 2, n.y + CARD_H / 2);
    let next = state;
    if (fid !== n.folderId) {
      next = setNoteFolder(state, d.id, fid);
      if (fid) say('folderIn', { name: getFolder(fid).name });
    }
    if (fid) next = growToFit(next, fid);
    commit(next);
  } else if (d.type === 'folder') {
    d.el.classList.remove('dragging');
    if (!d.moved) {
      if (d.onName) startRename(d.id);
      return;
    }
    // 폴더의 중심이 다른 폴더 안에 놓이면 그 폴더의 하위 폴더가 된다.
    const f = getFolder(d.id);
    const parent = folderAtPoint(state, f.x + f.w / 2, f.y + f.h / 2, folderDropExclude(d.id));
    let next = state;
    if (parent !== f.parentId) {
      next = setFolderParent(state, d.id, parent);
      if (parent) say('folderNest', { name: getFolder(parent).name, child: f.name });
      else say('folderOut', { name: f.name });
    }
    if (parent) next = growToFit(next, parent);
    commit(next);
  } else if (d.type === 'resize') {
    commit(state);
  } else if (d.type === 'pan') {
    if (!d.moved && selectedEdgeId) selectEdge(null);
  } else if (d.type === 'connect' && !cancelled) {
    const target = nodeUnderPointer(ev);
    const to = target && target.dataset.id;
    if (!to || to === d.from) return;
    const r = addEdge(state, { from: d.from, to, kind: edgeMode });
    if (r.edge) {
      commit(r.state);
      say('connect');
    } else if (r.reason === 'duplicate') {
      say('duplicate');
    }
  }
}
el.viewport.addEventListener('pointerup', (ev) => endDrag(ev, false));
el.viewport.addEventListener('pointercancel', (ev) => endDrag(ev, true));

el.viewport.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015));
}, { passive: false });

// ---------- 폴더 이름과 삭제 ----------

function startRename(id) {
  const input = el.folderLayer.querySelector(`.folder[data-id="${id}"] .folder-name`);
  if (!input) return;
  input.readOnly = false;
  input.focus();
  input.select();
}

function finishRename(input, keep) {
  if (input.readOnly) return;
  input.readOnly = true;
  const id = input.closest('.folder').dataset.id;
  const name = input.value.trim();
  if (keep && name) commit(updateFolder(state, id, { name }));
  else input.value = getFolder(id)?.name ?? '';
}

el.folderLayer.addEventListener('keydown', (ev) => {
  const input = ev.target.closest('.folder-name');
  if (!input) return;
  if (ev.key === 'Enter') finishRename(input, true);
  if (ev.key === 'Escape') finishRename(input, false);
});
el.folderLayer.addEventListener('focusout', (ev) => {
  const input = ev.target.closest('.folder-name');
  if (input) finishRename(input, true);
});
el.folderLayer.addEventListener('click', (ev) => {
  const del = ev.target.closest('.folder-del');
  if (!del) return;
  const f = getFolder(del.closest('.folder').dataset.id);
  if (!f) return;
  if (!confirm(`'${f.name}' 폴더를 지울까? 안의 노트와 폴더는 지워지지 않고 한 단계 바깥으로 나온다.`)) return;
  commit(deleteFolder(state, f.id));
});

// ---------- 위쪽 막대 ----------

// (x, y) 근처에서 다른 카드와 겹치지 않는 자리를 나선형으로 찾는다.
function freeSpot(x, y) {
  const gap = 16;
  const overlaps = (px, py) => state.notes.some((n) =>
    px < n.x + CARD_W + gap && px + CARD_W + gap > n.x && py < n.y + CARD_H + gap && py + CARD_H + gap > n.y);
  for (let ring = 0; ring < 12; ring += 1) {
    for (let i = -ring; i <= ring; i += 1) {
      for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        const px = Math.round(x + dx * (CARD_W + gap) / 2);
        const py = Math.round(y + dy * (CARD_H + gap));
        if (!overlaps(px, py)) return { x: px, y: py };
      }
    }
  }
  return { x, y };
}

$('btnNewNote').addEventListener('click', () => {
  const c = viewCenterWorld();
  const { x, y } = freeSpot(Math.round(c.x - CARD_W / 2), Math.round(c.y - CARD_H / 2));
  const r = addNote(state, { x, y, folderId: folderAtPoint(state, x + CARD_W / 2, y + CARD_H / 2) });
  selectedNoteId = r.note.id;
  selectedEdgeId = null;
  previewMode = false;
  commit(r.state);
  say('newNote');
  if (narrow.matches) setView('editor');
  el.noteTitle.focus();
  el.noteTitle.select();
});

// 새 폴더는 지금 있는 카드와 폴더의 오른쪽 빈 곳에 놓는다.
$('btnNewFolder').addEventListener('click', () => {
  const boxes = [...state.notes.map(noteRect), ...state.folders];
  const x = boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) + 60 : 0;
  const y = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const r = addFolder(state, { x, y, w: 420, h: 300, name: `새 폴더 ${state.folders.length + 1}` });
  selectedEdgeId = null;
  commit(r.state);
  if (narrow.matches) setView('canvas');
  fitView();
  say('folderNew');
});

function setEdgeMode(mode) {
  edgeMode = mode;
  el.modeLine.classList.toggle('on', mode === 'line');
  el.modeArrow.classList.toggle('on', mode === 'arrow');
  el.modeLine.setAttribute('aria-pressed', String(mode === 'line'));
  el.modeArrow.setAttribute('aria-pressed', String(mode === 'arrow'));
}
el.modeLine.addEventListener('click', () => setEdgeMode('line'));
el.modeArrow.addEventListener('click', () => setEdgeMode('arrow'));

// 검색 결과 개수 표시 (v0.3.0)
function showSearchCount() {
  if (!searchIds) {
    el.searchCount.hidden = true;
    return;
  }
  el.searchCount.hidden = false;
  el.searchCount.classList.toggle('none', searchIds.length === 0);
  el.searchCount.textContent = searchIds.length ? `${searchIds.length}개 · Enter` : '결과 없음';
}

el.search.addEventListener('input', () => {
  const q = el.search.value;
  searchIds = q.trim() ? searchNotes(state, q) : null;
  showSearchCount();
  renderCards();
});
el.search.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && searchIds && searchIds.length) {
    if (narrow.matches) setView('canvas');
    selectNote(searchIds[0], { center: true });
  }
  if (ev.key === 'Escape') {
    el.search.value = '';
    searchIds = null;
    showSearchCount();
    renderCards();
  }
});

function closeMenu() {
  document.querySelector('.menu').open = false;
}

$('btnExport').addEventListener('click', () => {
  const blob = new Blob([exportData(state)], { type: 'application/json' });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  a.href = URL.createObjectURL(blob);
  a.download = `hachi-wiki-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  closeMenu();
  say('export');
});

$('btnImport').addEventListener('click', () => {
  closeMenu();
  el.fileImport.click();
});
el.fileImport.addEventListener('change', async () => {
  const file = el.fileImport.files[0];
  el.fileImport.value = '';
  if (!file) return;
  try {
    const next = importData(await file.text());
    if (!confirm('지금 노트를 가져온 파일의 노트로 바꿀까? 지금 노트는 사라진다.')) return;
    selectedNoteId = null;
    selectedEdgeId = null;
    commit(next);
    fitView();
    say('import');
  } catch {
    say('importError');
  }
});

$('btnReset').addEventListener('click', () => {
  closeMenu();
  if (!confirm('모든 노트를 지우고 예시 노트로 되돌릴까?')) return;
  selectedNoteId = null;
  selectedEdgeId = null;
  commit(seedState());
  fitView();
  say('welcome');
});

$('zoomIn').addEventListener('click', () => zoomCenter(1.2));
$('zoomOut').addEventListener('click', () => zoomCenter(1 / 1.2));
$('zoomFit').addEventListener('click', fitView);
$('hachiBtn').addEventListener('click', () => say('welcome'));

// ---------- 좁은 화면 탭 ----------

function setView(name) {
  el.layout.dataset.view = name;
  $('tabEditor').classList.toggle('on', name === 'editor');
  $('tabCanvas').classList.toggle('on', name === 'canvas');
  if (name === 'canvas') requestAnimationFrame(applyView);
}
$('tabEditor').addEventListener('click', () => setView('editor'));
$('tabCanvas').addEventListener('click', () => setView('canvas'));

// ---------- 키보드 ----------

document.addEventListener('keydown', (ev) => {
  const typing = ev.target.closest('input, textarea');
  if (typing) return;
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedEdgeId) {
    const id = selectedEdgeId;
    selectedEdgeId = null;
    commit(deleteEdge(state, id));
  }
  if (ev.key === 'Escape') selectEdge(null);
});

// ---------- 배포 버전과 서버 상태 ----------

function formatKst(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

async function loadVersion() {
  let local = true;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const v = await res.json();
    local = v.env === 'local';
    el.versionText.textContent = `v${v.version} · commit ${v.commit} · ${local ? '로컬 빌드' : '배포'} ${formatKst(v.builtAt)}`;
  } catch {
    el.versionText.textContent = '로컬 실행 (버전 정보 없음)';
  }
  try {
    if (local) throw new Error('로컬에는 서버 함수가 없다');
    const res = await fetch('/api/health', { cache: 'no-store' });
    const h = res.ok ? await res.json() : null;
    if (h && h.status === 'ok') {
      el.healthText.textContent = '서버 정상';
      el.healthText.className = 'health ok';
      return;
    }
    throw new Error();
  } catch {
    el.healthText.textContent = '서버 함수 없음 (로컬)';
    el.healthText.className = 'health off';
  }
}

// ---------- 시작 ----------

async function init() {
  const saved = await loadState();
  let first = false;
  try {
    if (!saved) throw new Error('empty');
    state = importData(JSON.stringify({ ...saved, app: 'hachi-wiki' }));
  } catch {
    state = seedState();
    first = true;
    persist();
  }
  if (narrow.matches) setView('canvas');
  render();
  applyView();
  // 캔버스 크기가 처음 정해지는 때에 한 번 전체를 맞춘다.
  // 글꼴과 스타일을 늦게 받으면 크기가 나중에 정해지므로 페이지 로드가 끝난 뒤에도 한 번 더 맞춘다.
  let fitted = false;
  const fitOnce = () => {
    if (fitted || el.viewport.getBoundingClientRect().width < 10) return;
    fitted = true;
    fitView();
  };
  const ro = new ResizeObserver(() => fitOnce());
  ro.observe(el.viewport);
  if (document.readyState === 'complete') requestAnimationFrame(fitOnce);
  else window.addEventListener('load', () => { fitted = false; fitOnce(); }, { once: true });
  el.saveStateText.textContent = '';
  say(first ? 'welcome' : 'back');
  loadVersion();
}

init();
