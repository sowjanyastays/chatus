// Private key is stored as a base64 string in localStorage (synchronous reads)
// AND mirrored to IndexedDB (async, more persistent across PWA reinstalls).
// On boot, call initKeyStore() to restore from IDB into localStorage if missing.

const LS_KEY = 'chatus_e2ee_private_key';
const DB_NAME = 'chatus-keystore';
const STORE_NAME = 'keys';
const IDB_KEY = 'private_key';

// ── IndexedDB helpers (best-effort, never throw) ─────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<string | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSet(val: string): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(val, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

async function idbDelete(): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Public sync API (unchanged interface) ────────────────────────────────────

export function savePrivateKey(secretKeyB64: string): void {
  localStorage.setItem(LS_KEY, secretKeyB64);
  idbSet(secretKeyB64); // async mirror — fire and forget
}

export function loadPrivateKey(): string | null {
  return localStorage.getItem(LS_KEY);
}

export function deletePrivateKey(): void {
  localStorage.removeItem(LS_KEY);
  idbDelete();
}

// ── Boot restore ─────────────────────────────────────────────────────────────

// Call once during app startup (before any auth-dependent rendering).
// If localStorage is empty but IDB has a backup, it restores it silently.
export async function initKeyStore(): Promise<void> {
  if (localStorage.getItem(LS_KEY)) return;
  const backed = await idbGet();
  if (backed) {
    localStorage.setItem(LS_KEY, backed);
    console.info('[KeyStore] Private key restored from IndexedDB backup.');
  }
}

// ── Export / import for manual backup ────────────────────────────────────────

// Returns the raw base64 key string for the user to copy/save.
export function exportPrivateKey(): string | null {
  return localStorage.getItem(LS_KEY);
}

// Imports a base64 key string. Returns true if valid and saved.
export function importPrivateKey(base64: string): boolean {
  try {
    const trimmed = base64.trim();
    if (!trimmed) return false;
    const bytes = atob(trimmed); // validate decodable
    if (bytes.length !== 32) return false; // X25519 keys are 32 bytes
    savePrivateKey(trimmed);
    return true;
  } catch { return false; }
}
