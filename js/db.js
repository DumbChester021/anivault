/**
 * db.js — IndexedDB wrapper for persistent local storage
 * Stores: favorites, history. Cloud sync hooks injected from app.js via setSyncHooks().
 *
 * When logged in, IndexedDB acts as a local cache — cloud (Supabase) is the
 * source of truth. Writes are batched through a 2-second debounced queue to
 * respect rate limits. Records synced from cloud carry:
 *   - `_cloudSynced: true`   — marks record as cloud-originated
 *   - `_cloudSyncedBy: uid`  — the user ID who owns this synced record
 * This prevents data leakage when switching accounts on the same browser.
 */

const DB_NAME = 'anivault';
const DB_VERSION = 2; // Incremented for history store
const STORE_FAV = 'favorites';
const STORE_HISTORY = 'history';

let _db = null;
let _sync = null;
let _auth = null;

export function setSyncHooks(syncMod, authMod) {
    _sync = syncMod;
    _auth = authMod;
}

function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_FAV)) {
                db.createObjectStore(STORE_FAV, { keyPath: 'mal_id' });
            }
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror = (e) => reject(e.target.error);
    });
}

function txOp(storeName, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const req = fn(transaction.objectStore(storeName));
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    }));
}

// In-memory Set of mal_ids for O(1) lookups — mutated in place so importers
// always see the current state without needing to re-import.
export const favoritesCache = new Set();

export async function initCache() {
    const all = await favorites.getAll();
    favoritesCache.clear();
    for (const a of all) favoritesCache.add(a.mal_id);
}

// ─── Debounced Cloud Sync Queue ──────────────────────────────────────
// Batches mutations and flushes every 2 seconds to avoid hammering Supabase.

const _pending = { favAdds: new Map(), favRemoves: new Set(), histSaves: new Map() };
let _syncTimer = null;
const SYNC_DEBOUNCE_MS = 2000;

function scheduleSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => flushSync(), SYNC_DEBOUNCE_MS);
}

/**
 * Immediately flush all pending cloud writes. Safe to call multiple times.
 * Called on debounce expiry, page unload, and sign-out.
 */
export async function flushSync() {
    if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
    if (!_auth?.isLoggedIn() || !_sync) return;

    // Snapshot & clear pending
    const favAdds = [..._pending.favAdds.values()];
    const favRemoves = [..._pending.favRemoves];
    const histSaves = [..._pending.histSaves.values()];
    _pending.favAdds.clear();
    _pending.favRemoves.clear();
    _pending.histSaves.clear();

    // Remove any adds that were subsequently removed
    const filteredAdds = favAdds.filter(r => !favRemoves.includes(r.mal_id));

    try {
        const ops = [];
        if (filteredAdds.length) ops.push(_sync.batchSyncFavorites(filteredAdds));
        if (favRemoves.length) ops.push(_sync.batchRemoveFavorites(favRemoves));
        if (histSaves.length) ops.push(_sync.batchSyncHistory(histSaves));
        if (ops.length) await Promise.all(ops);
    } catch (err) {
        console.warn('[db] batch sync failed:', err);
        // Re-queue failed items so next flush retries
        for (const r of filteredAdds) _pending.favAdds.set(r.mal_id, r);
        for (const id of favRemoves) _pending.favRemoves.add(id);
        for (const r of histSaves) _pending.histSaves.set(r.id, r);
        scheduleSync(); // retry after another debounce window
    }
}

// Flush on page unload so nothing is lost
if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushSync();
    });
    window.addEventListener('beforeunload', () => flushSync());
}

// ─── Favorites ───────────────────────────────────────────────────────

export const favorites = {
    add(anime) {
        const record = {
            mal_id: anime.mal_id,
            title: anime.title,
            title_english: anime.title_english || null,
            images: anime.images,
            score: anime.score || null,
            type: anime.type || null,
            episodes: anime.episodes || null,
            status: anime.status || null,
            season: anime.season || null,
            year: anime.year || null,
            savedAt: Date.now(),
        };
        favoritesCache.add(anime.mal_id);
        const dbWrite = txOp(STORE_FAV, 'readwrite', s => s.put(record));
        if (_auth?.isLoggedIn()) {
            // Cancel any pending remove for this ID, queue add
            _pending.favRemoves.delete(anime.mal_id);
            _pending.favAdds.set(anime.mal_id, record);
            scheduleSync();
        }
        return dbWrite;
    },
    remove(malId) {
        favoritesCache.delete(malId);
        if (_auth?.isLoggedIn()) {
            // Cancel any pending add for this ID, queue remove
            _pending.favAdds.delete(malId);
            _pending.favRemoves.add(malId);
            scheduleSync();
        }
        // Notify notification system to clean up stale entries for this anime
        document.dispatchEvent(new CustomEvent('favoriteRemoved', { detail: { malId } }));
        return txOp(STORE_FAV, 'readwrite', s => s.delete(malId));
    },
    getAll() {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FAV, 'readonly');
            const req = tx.objectStore(STORE_FAV).getAll();
            req.onsuccess = (e) => {
                resolve(e.target.result.sort((a, b) => b.savedAt - a.savedAt));
            };
            req.onerror = (e) => reject(e.target.error);
        }));
    },
    /** Get only records that were NOT synced from cloud by the CURRENT user */
    async getLocalOnly() {
        const all = await this.getAll();
        const uid = _auth?.getCurrentUser?.()?.id;
        return all.filter(r => {
            if (!r._cloudSynced) return true;           // genuinely local
            if (uid && r._cloudSyncedBy !== uid) return true; // belongs to another user → treat as local for this user
            return false;                                // synced by current user → skip
        });
    },
    clear() {
        favoritesCache.clear();
        return txOp(STORE_FAV, 'readwrite', s => s.clear());
    },
};

// ─── Cloud ↔ Local Sync ──────────────────────────────────────────────

export async function syncCloudToLocal() {
    if (!_sync || !_auth?.isLoggedIn()) return;
    try {
        const [cloudFavs, cloudHist] = await Promise.all([
            _sync.fetchCloudFavorites(),
            _sync.fetchCloudHistory(),
        ]);
        const uid = _auth?.getCurrentUser?.()?.id || null;
        if (cloudFavs !== null && cloudFavs.length > 0) {
            const db = await openDB();
            await new Promise((res, rej) => {
                const tx = db.transaction(STORE_FAV, 'readwrite');
                const store = tx.objectStore(STORE_FAV);
                // Tag with both _cloudSynced flag and owner user ID
                for (const f of cloudFavs) store.put({ ...f, _cloudSynced: true, _cloudSyncedBy: uid });
                tx.oncomplete = res;
                tx.onerror = (e) => rej(e.target.error);
            });
            favoritesCache.clear();
            for (const f of cloudFavs) favoritesCache.add(f.mal_id);
        }
        if (cloudHist !== null && cloudHist.length > 0) {
            const db = await openDB();
            await new Promise((res, rej) => {
                const tx = db.transaction(STORE_HISTORY, 'readwrite');
                const store = tx.objectStore(STORE_HISTORY);
                for (const h of cloudHist) store.put({ ...h, _cloudSynced: true, _cloudSyncedBy: uid });
                tx.oncomplete = res;
                tx.onerror = (e) => rej(e.target.error);
            });
        }
    } catch (err) {
        console.error('[db] syncCloudToLocal:', err);
        throw err;
    }
}

// ─── History ─────────────────────────────────────────────────────────

export const history = {
    save(anime, ep, time, duration, isDub) {
        if (!anime || !ep) return Promise.resolve();
        const record = {
            id: anime.id, // Store by anime ID so a single anime only has one history entry (latest watched)
            anime_id: anime.id,
            anime_title: anime.title || null,
            anime_image: anime.image || null,
            episode_id: ep.id,
            episode_number: ep.number,
            episode_title: ep.title || null,
            time: time,
            duration: duration,
            is_dub: isDub,
            updatedAt: Date.now(),
            score: anime.score || null,
            type: anime.type || null,
            status: anime.status || null,
            season: anime.season || null,
            year: anime.year || null,
            episodes: anime.episodes || null,
        };
        const dbWrite = txOp(STORE_HISTORY, 'readwrite', s => s.put(record));
        if (_auth?.isLoggedIn()) {
            _pending.histSaves.set(record.id, record);
            scheduleSync();
        }
        return dbWrite;
    },
    getAll() {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_HISTORY, 'readonly');
            const req = tx.objectStore(STORE_HISTORY).getAll();
            req.onsuccess = (e) => {
                resolve(e.target.result.sort((a, b) => b.updatedAt - a.updatedAt));
            };
            req.onerror = (e) => reject(e.target.error);
        }));
    },
    /** Get only records that were NOT synced from cloud by the CURRENT user */
    async getLocalOnly() {
        const all = await this.getAll();
        const uid = _auth?.getCurrentUser?.()?.id;
        return all.filter(r => {
            if (!r._cloudSynced) return true;
            if (uid && r._cloudSyncedBy !== uid) return true;
            return false;
        });
    },
    clear() {
        return txOp(STORE_HISTORY, 'readwrite', s => s.clear());
    },
};

// ─── Account Isolation ───────────────────────────────────────────────
// Purge cloud-synced records belonging to a DIFFERENT user to prevent
// data leakage when switching accounts on the same browser.
// Genuinely local records (no _cloudSynced) are kept intact.

export async function clearOtherUserData(currentUid) {
    if (!currentUid) return;
    const db = await openDB();

    // Helper: iterate a store, delete records synced by a different user
    async function purgeStore(storeName) {
        return new Promise((res, rej) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) return;
                const rec = cursor.value;
                if (rec._cloudSynced && rec._cloudSyncedBy && rec._cloudSyncedBy !== currentUid) {
                    cursor.delete();
                }
                cursor.continue();
            };
            tx.oncomplete = res;
            tx.onerror = (e) => rej(e.target.error);
        });
    }

    await Promise.all([
        purgeStore(STORE_FAV),
        purgeStore(STORE_HISTORY),
    ]);

    // Rebuild in-memory cache after purge
    await initCache();
}

// Purge ALL cloud-synced records on sign-out so the next visitor
// (or unauthenticated state) sees a clean slate.
export async function clearCloudData() {
    const db = await openDB();

    async function purgeStore(storeName) {
        return new Promise((res, rej) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) return;
                if (cursor.value._cloudSynced) cursor.delete();
                cursor.continue();
            };
            tx.oncomplete = res;
            tx.onerror = (e) => rej(e.target.error);
        });
    }

    await Promise.all([purgeStore(STORE_FAV), purgeStore(STORE_HISTORY)]);
    await initCache();
}
