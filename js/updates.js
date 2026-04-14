/**
 * updates.js — Background update checker for favorited anime
 *
 * Ongoing  (Currently Airing) → Consumet ep count + Jikan broadcast schedule
 * Completed (Finished Airing) → Jikan relations: sequel airing/upcoming
 *
 * Results cached in localStorage for 6 hours per entry.
 * onResult(malId, update, broadcast) fires immediately for cached hits,
 * then again when a fresh check finds something new.
 */

import { CONSUMET_API_BASE } from './config.js';
import { jikanGet, getAnimeById } from './api.js';

const CACHE_KEY = 'anivault_ep_updates';
const CACHE_TTL  = 6 * 60 * 60 * 1000; // 6 hours

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Cache helpers ────────────────────────────────────────────────────

function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
    catch { return {}; }
}

function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
    catch { /* quota exceeded — skip */ }
}

// ─── Consumet helpers ─────────────────────────────────────────────────

async function consumetSearch(title) {
    try {
        const resp = await fetch(
            `${CONSUMET_API_BASE}/anime/animekai/${encodeURIComponent(title)}?page=1`
        );
        if (!resp.ok) return null;
        return (await resp.json())?.results?.[0] ?? null;
    } catch { return null; }
}

async function consumetEpCount(animeKaiId) {
    try {
        const resp = await fetch(
            `${CONSUMET_API_BASE}/anime/animekai/info?id=${encodeURIComponent(animeKaiId)}`
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        return Array.isArray(data?.episodes) ? data.episodes.length : null;
    } catch { return null; }
}

// ─── Per-anime check logic ────────────────────────────────────────────

async function checkOngoing(fav, prevCount) {
    // 1. Consumet: current episode count
    const query = fav.title_english || fav.title;
    const hit = await consumetSearch(query);
    let epCount = null;
    if (hit) {
        await sleep(400);
        epCount = await consumetEpCount(hit.id);
    }

    // 2. Jikan: broadcast schedule (goes through rate-limited queue)
    let broadcast = null;
    try {
        const data = await getAnimeById(fav.mal_id);
        const raw = data?.data?.broadcast ?? null;
        if (raw?.day && raw.day !== 'Unknown') broadcast = raw;
    } catch { /* silent */ }

    // First run (prevCount === 0): establish baseline only, no badge
    const update = (epCount !== null && prevCount > 0 && epCount > prevCount)
        ? { type: 'new_episodes', delta: epCount - prevCount, total: epCount }
        : null;

    return { ep_count: epCount, broadcast, update };
}

async function checkCompleted(fav) {
    const relData = await jikanGet(`/anime/${fav.mal_id}/relations`);
    const sequelIds = (relData?.data ?? [])
        .filter(r => r.relation === 'Sequel')
        .flatMap(r => (r.entry ?? []).filter(e => e.type === 'anime').map(e => e.mal_id));

    for (const id of sequelIds.slice(0, 3)) {
        const sq = (await jikanGet(`/anime/${id}`))?.data;
        if (!sq) continue;
        if (sq.status === 'Currently Airing' || sq.status === 'Not yet aired') {
            return {
                update: {
                    type: 'new_season',
                    title: sq.title_english || sq.title,
                    status: sq.status,
                },
            };
        }
    }
    return { update: null };
}

// ─── Public utilities ─────────────────────────────────────────────────

/**
 * Returns cached broadcast objects keyed by malId (string).
 * Only entries that have been fetched at least once are present.
 */
export function getOngoingBroadcasts() {
    const cache = loadCache();
    const result = {};
    for (const [malId, entry] of Object.entries(cache)) {
        if (entry.broadcast) result[malId] = entry.broadcast;
    }
    return result;
}

/**
 * Compute the UTC timestamp (ms) of the next episode air time.
 * Returns null if broadcast is missing/unparseable or if the next
 * occurrence is more than 8 days out (likely stale data).
 *
 * @param {{ day: string, time: string, timezone: string }} broadcast
 * @returns {number|null}
 */
export function nextEpisodeMs(broadcast) {
    if (!broadcast?.day || !broadcast?.time) return null;

    // Jikan uses plural: "Mondays", "Tuesdays", …, "Sundays"
    const dayIndex = ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays']
        .indexOf(broadcast.day);
    if (dayIndex === -1) return null;

    const [h, m] = broadcast.time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;

    const tz = broadcast.timezone || 'Asia/Tokyo';
    const now = new Date();

    // Compute tz offset (ms): how far ahead the target tz is from UTC.
    // Works by comparing the same moment expressed in UTC vs target tz
    // as naive Date strings (the difference == tz offset, browser-tz-agnostic).
    const tzOffset = (() => {
        const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
        const tzStr  = now.toLocaleString('en-US', { timeZone: tz });
        return new Date(tzStr) - new Date(utcStr);
    })();

    // Walk forward up to 8 days to find the next occurrence of targetDay
    for (let d = 0; d < 8; d++) {
        const probe = new Date(now.getTime() + d * 86400000);

        // Day of week (0=Sun … 6=Sat) in the target timezone
        const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
            .indexOf(probe.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }));

        if (dow !== dayIndex) continue;

        // Date components in target tz, formatted "MM/DD/YYYY"
        const dateStr = probe.toLocaleDateString('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        });
        const [mo, dy, yr] = dateStr.split('/');

        // UTC ms when the target tz clock shows h:m on this date:
        //   naive UTC at (yr/mo/dy h:m) − tzOffset
        const targetUTC = Date.UTC(+yr, +mo - 1, +dy, h, m, 0) - tzOffset;

        if (targetUTC > now.getTime()) return targetUTC;
        // Same weekday but already aired → keep walking (will land on +7 days)
    }

    return null;
}

/**
 * Format a target UTC timestamp into a human-readable countdown string.
 * Returns null when the timestamp is stale (> 3h past).
 */
export function formatCountdown(targetMs) {
    const diff = targetMs - Date.now();

    if (diff < 0) {
        return diff > -3 * 3600000 ? 'just aired!' : null;
    }

    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);

    if (days > 0)  return `EP in ${days}d ${hours}h`;
    if (hours > 0) return `EP in ${hours}h ${mins}m`;
    return `EP in ${mins}m`;
}

// ─── Main export ──────────────────────────────────────────────────────

/**
 * Check all favorites for updates + broadcast schedule.
 * Fires onResult(malId, update, broadcast) — any of the last two may be null.
 * Cached hits fire immediately (sync-ish); fresh fetches fire as they complete.
 * Never throws.
 *
 * update shapes:
 *   { type: 'new_episodes', delta: number, total: number }
 *   { type: 'new_season',   title: string, status: string }
 */
export async function checkFavoritesForUpdates(favs, onResult) {
    const cache = loadCache();
    const now   = Date.now();

    // 1. Emit cached results immediately — zero latency for returning users
    for (const fav of favs) {
        const entry = cache[fav.mal_id];
        if (entry && (entry.update || entry.broadcast)) {
            onResult(fav.mal_id, entry.update ?? null, entry.broadcast ?? null);
        }
    }

    const ongoing   = favs.filter(f => f.status === 'Currently Airing');
    const completed = favs.filter(f => f.status === 'Finished Airing').slice(0, 15);

    // 2. Ongoing — Consumet ep count + Jikan broadcast (sequential + sleep)
    for (const fav of ongoing) {
        const entry = cache[fav.mal_id];
        if (entry && (now - entry.checked_at) < CACHE_TTL) continue;

        try {
            const result = await checkOngoing(fav, entry?.ep_count ?? 0);
            cache[fav.mal_id] = {
                checked_at: now,
                ep_count:   result.ep_count,
                broadcast:  result.broadcast,
                update:     result.update,
            };
            saveCache(cache);
            if (result.update || result.broadcast) {
                onResult(fav.mal_id, result.update, result.broadcast);
            }
        } catch { /* silent — never block */ }

        await sleep(600);
    }

    // 3. Completed — Jikan relations (built-in rate limiter, no extra sleep needed)
    for (const fav of completed) {
        const entry = cache[fav.mal_id];
        if (entry && (now - entry.checked_at) < CACHE_TTL) continue;

        try {
            const result = await checkCompleted(fav);
            cache[fav.mal_id] = { checked_at: now, update: result.update };
            saveCache(cache);
            if (result.update) onResult(fav.mal_id, result.update, null);
        } catch { /* silent */ }
    }
}
