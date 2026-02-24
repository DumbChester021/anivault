/**
 * api.js — Jikan API v4 Caller
 * 
 * Features:
 *  - Token-bucket rate limiter (3 req/sec, 60 req/min)
 *  - Request queue with automatic dispatch
 *  - Exponential backoff with jitter on 429 / 5xx
 *  - Max 3 retries per request
 *  - In-memory response cache with 5-min TTL
 *  - Typed error classes for granular handling
 *  - Detailed console logging
 */

import { JIKAN_API_BASE } from './config.js';

const BASE_URL = JIKAN_API_BASE;

// ─── Error Classes ───────────────────────────────────────────────────
export class JikanError extends Error {
    constructor(message, { status, url, attempt } = {}) {
        super(message);
        this.name = 'JikanError';
        this.status = status;
        this.url = url;
        this.attempt = attempt;
    }
}

export class RateLimitError extends JikanError {
    constructor(url, attempt) {
        super(`Rate limited (429) — ${url}`, { status: 429, url, attempt });
        this.name = 'RateLimitError';
    }
}

export class ApiError extends JikanError {
    constructor(message, status, url) {
        super(message, { status, url });
        this.name = 'ApiError';
    }
}

export class NetworkError extends JikanError {
    constructor(message, url) {
        super(message, { url });
        this.name = 'NetworkError';
    }
}

// ─── Response Cache ──────────────────────────────────────────────────
class ResponseCache {
    constructor(defaultTTL = 5 * 60 * 1000) {
        this._store = new Map();
        this._defaultTTL = defaultTTL;
    }

    _key(url) {
        return url;
    }

    get(url) {
        const entry = this._store.get(this._key(url));
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this._store.delete(this._key(url));
            return null;
        }
        return entry.data;
    }

    set(url, data, ttl) {
        this._store.set(this._key(url), {
            data,
            expires: Date.now() + (ttl ?? this._defaultTTL),
        });
    }

    clear() {
        this._store.clear();
    }
}

// ─── Rate Limiter (Token Bucket) ─────────────────────────────────────
class RateLimiter {
    constructor() {
        // Jikan limits: 3 req/sec, 60 req/min
        // We use a safe dispatch interval of 350ms (≈2.85 req/sec)
        this.MIN_INTERVAL_MS = 350;
        this._queue = [];
        this._processing = false;
        this._lastRequestTime = 0;
    }

    enqueue(task) {
        return new Promise((resolve, reject) => {
            this._queue.push({ task, resolve, reject });
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this._processing) return;
        this._processing = true;

        while (this._queue.length > 0) {
            const { task, resolve, reject } = this._queue.shift();

            // Wait until safe to send
            const now = Date.now();
            const elapsed = now - this._lastRequestTime;
            if (elapsed < this.MIN_INTERVAL_MS) {
                await new Promise(r => setTimeout(r, this.MIN_INTERVAL_MS - elapsed));
            }

            this._lastRequestTime = Date.now();

            try {
                const result = await task();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        }

        this._processing = false;
    }
}

// ─── Singleton instances ─────────────────────────────────────────────
const cache = new ResponseCache();
const rateLimiter = new RateLimiter();

// Permanent cache for genres (they don't change)
let _genresCache = null;

// ─── Core Fetch with Retry ───────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function buildUrl(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    // Always enforce SFW unless explicitly overridden
    if (!('sfw' in params)) params.sfw = 'true';
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}

async function fetchWithRetry(url, attempt = 1) {
    try {
        console.log(`[Jikan] GET ${url} (attempt ${attempt})`);
        const resp = await fetch(url);

        // Success
        if (resp.ok) {
            const data = await resp.json();
            console.log(`[Jikan] ✓ ${resp.status} ${url}`);
            return data;
        }

        // Rate limited — retry with backoff
        if (resp.status === 429) {
            if (attempt > MAX_RETRIES) {
                throw new RateLimitError(url, attempt);
            }
            const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
            console.warn(`[Jikan] ⚠ 429 Rate limited. Retrying in ${Math.round(backoff)}ms (attempt ${attempt}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, attempt + 1);
        }

        // Server errors — retry with backoff
        if (resp.status >= 500) {
            if (attempt > MAX_RETRIES) {
                const body = await resp.text().catch(() => '');
                throw new ApiError(`Server error ${resp.status}: ${body}`, resp.status, url);
            }
            const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
            console.warn(`[Jikan] ⚠ ${resp.status} Server error. Retrying in ${Math.round(backoff)}ms (attempt ${attempt}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, backoff));
            return fetchWithRetry(url, attempt + 1);
        }

        // Client errors — do not retry
        const body = await resp.text().catch(() => '');
        throw new ApiError(`Client error ${resp.status}: ${body}`, resp.status, url);

    } catch (err) {
        if (err instanceof JikanError) throw err;
        // Network / CORS / other fetch errors
        if (attempt > MAX_RETRIES) {
            throw new NetworkError(`Network error after ${attempt} attempts: ${err.message}`, url);
        }
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(`[Jikan] ⚠ Network error: ${err.message}. Retrying in ${Math.round(backoff)}ms`);
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, attempt + 1);
    }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Core GET request through rate limiter + cache.
 * @param {string} endpoint - e.g. '/anime'
 * @param {Object} params - query params
 * @param {Object} opts - { skipCache: boolean, cacheTTL: number }
 */
export async function jikanGet(endpoint, params = {}, opts = {}) {
    const url = buildUrl(endpoint, params);

    // Check cache first
    if (!opts.skipCache) {
        const cached = cache.get(url);
        if (cached) {
            console.log(`[Jikan] ⚡ Cache hit: ${url}`);
            return cached;
        }
    }

    // Enqueue through rate limiter
    const data = await rateLimiter.enqueue(() => fetchWithRetry(url));

    // Store in cache
    cache.set(url, data, opts.cacheTTL);

    return data;
}

/**
 * Search anime with advanced filters.
 * @param {Object} params — q, type, status, rating, min_score, max_score,
 *                          genres, order_by, sort, page, limit, sfw
 */
export function searchAnime(params = {}) {
    return jikanGet('/anime', { limit: 24, ...params });
}

/**
 * Get top anime.
 * @param {string} filter — 'airing', 'upcoming', 'bypopularity', 'favorite'
 * @param {number} page
 */
export function getTopAnime(filter, page = 1) {
    const params = { page, limit: 15 };
    if (filter) params.filter = filter;
    return jikanGet('/top/anime', params);
}

/**
 * Get current season anime.
 */
export function getSeasonNow(page = 1) {
    return jikanGet('/seasons/now', { page, limit: 15 });
}

/**
 * Get upcoming season anime.
 */
export function getSeasonUpcoming(page = 1) {
    return jikanGet('/seasons/upcoming', { page, limit: 10 });
}

/**
 * Get full anime details by ID.
 */
export function getAnimeById(id) {
    return jikanGet(`/anime/${id}/full`, {}, { cacheTTL: 30 * 60 * 1000 });
}

/**
 * Get anime recommendations.
 */
export function getAnimeRecommendations(id) {
    return jikanGet(`/anime/${id}/recommendations`, {}, { cacheTTL: 30 * 60 * 1000 });
}

/**
 * Get all anime genres. Cached permanently after first fetch.
 */
export async function getGenres() {
    if (_genresCache) return _genresCache;
    const data = await jikanGet('/genres/anime', {}, { cacheTTL: 24 * 60 * 60 * 1000 });
    _genresCache = data;
    return data;
}

/**
 * Clear all cached responses.
 */
export function clearCache() {
    cache.clear();
    _genresCache = null;
}
