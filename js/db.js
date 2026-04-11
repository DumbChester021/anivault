/**
 * db.js — IndexedDB wrapper for persistent local storage
 * Stores: favorites
 */

const DB_NAME = 'anivault';
const DB_VERSION = 2; // Incremented for history store
const STORE_FAV = 'favorites';
const STORE_HISTORY = 'history';

let _db = null;

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
        return txOp(STORE_FAV, 'readwrite', s => s.put(record));
    },
    remove(malId) {
        favoritesCache.delete(malId);
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
};

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
        };
        return txOp(STORE_HISTORY, 'readwrite', s => s.put(record));
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
};
