// 브라우저 저장소. IndexedDB에 상태 전체를 한 덩어리로 저장한다.
// IndexedDB를 쓸 수 없는 브라우저(일부 사생활 보호 모드)에서는 localStorage를 쓴다.

const DB_NAME = 'hachi-wiki';
const STORE = 'kv';
const KEY = 'state';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function loadState() {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(DB_NAME);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function saveState(state) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(DB_NAME, JSON.stringify(state));
    } catch {
      // 저장할 곳이 없다. 화면은 계속 동작한다.
    }
  }
}
