/**
 * Armazenamento de arquivos grandes (fotos) no IndexedDB do navegador.
 * O localStorage tem limite de ~5 MB e só guarda texto; o IndexedDB guarda Blobs direto.
 * Se o IndexedDB não estiver disponível (modo privado antigo etc.), as funções falham em silêncio.
 */
const DB_NAME = 'ssx', STORE = 'blobs';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB indisponível')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const putBlob = (key, blob) => tx('readwrite', s => s.put(blob, key)).catch(() => false);
export const getBlob = key => tx('readonly', s => s.get(key)).catch(() => null);
export const deleteBlob = key => tx('readwrite', s => s.delete(key)).catch(() => false);

/** Pede ao navegador para não apagar os dados do site sem perguntar (importante no Safari/iOS). */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (_) { /* ignore */ }
}
