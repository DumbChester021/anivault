/**
 * streaming.js — Hianime API + MegaPlay embed integration
 *
 * Uses a self-hosted aniwatch-api instance to search anime
 * and resolve episode IDs, then builds MegaPlay embed URLs.
 */

import { HIANIME_API_BASE, MEGAPLAY_BASE } from './config.js';

export const LANGUAGES = { SUB: 'sub', DUB: 'dub' };

// ─── Hianime API Calls ──────────────────────────────────────────────

/**
 * Search hianime for anime by title.
 * @param {string} query — anime title
 * @param {number} page
 * @returns {Promise<{animes: Array, totalPages: number, hasNextPage: boolean}>}
 */
export async function searchHianime(query, page = 1) {
    const url = `${HIANIME_API_BASE}/api/v2/hianime/search?q=${encodeURIComponent(query)}&page=${page}`;
    console.log(`[Hianime] Search: ${url}`);

    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Hianime search failed (${resp.status})`);
    }

    const json = await resp.json();
    if (json.status !== 200) {
        throw new Error('Hianime search returned unsuccessful response');
    }
    return json.data;
}

/**
 * Get anime details from hianime.
 * @param {string} animeId — e.g. 'steinsgate-3'
 * @returns {Promise<Object>}
 */
export async function getAnimeInfo(animeId) {
    const url = `${HIANIME_API_BASE}/api/v2/hianime/anime/${encodeURIComponent(animeId)}`;
    console.log(`[Hianime] Info: ${url}`);

    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Hianime anime info failed (${resp.status})`);
    }

    const json = await resp.json();
    if (json.status !== 200) {
        throw new Error('Hianime anime info returned unsuccessful response');
    }
    return json.data;
}

/**
 * Get episodes for an anime.
 * @param {string} animeId — e.g. 'steinsgate-3'
 * @returns {Promise<{totalEpisodes: number, episodes: Array<{number, title, episodeId, isFiller}>}>}
 */
export async function getEpisodes(animeId) {
    const url = `${HIANIME_API_BASE}/api/v2/hianime/anime/${encodeURIComponent(animeId)}/episodes`;
    console.log(`[Hianime] Episodes: ${url}`);

    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Hianime episodes failed (${resp.status})`);
    }

    const json = await resp.json();
    if (json.status !== 200) {
        throw new Error('Hianime episodes returned unsuccessful response');
    }
    return json.data;
}

// ─── Episode ID Helpers ──────────────────────────────────────────────

/**
 * Extract the numeric ep ID from a hianime episodeId string.
 * e.g. 'steinsgate-3?ep=213' → '213'
 */
export function extractEpId(episodeId) {
    if (!episodeId) return null;
    const match = episodeId.match(/[?&]ep=(\d+)/);
    return match ? match[1] : null;
}

// ─── MegaPlay Embed ──────────────────────────────────────────────────

/**
 * Build a MegaPlay embed URL.
 * @param {string} epId — numeric episode ID from hianime
 * @param {string} language — 'sub' or 'dub'
 * @returns {string}
 */
export function buildEmbedUrl(epId, language = LANGUAGES.SUB) {
    return `${MEGAPLAY_BASE}/${epId}/${language}`;
}
