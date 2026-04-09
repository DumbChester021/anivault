/**
 * streaming.js — Consumet AnimeKai integration
 *
 * Wraps the self-hosted Consumet API (animekai provider) to:
 *  - Search anime
 *  - Fetch episode lists
 *  - Fetch streaming sources (MegaUp → m3u8/mp4)
 */

import { CONSUMET_API_BASE } from './config.js';

/**
 * Search AnimeKai for anime by title.
 * @param {string} query
 * @param {number} page
 * @returns {Promise<{currentPage, hasNextPage, results: Array}>}
 *   results items: { id, title, image, subOrDub, type, ... }
 */
export async function searchAnimekai(query, page = 1) {
    const url = `${CONSUMET_API_BASE}/anime/animekai/${encodeURIComponent(query)}?page=${page}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`AnimeKai search failed (${resp.status})`);
    return resp.json();
}

/**
 * Get full anime info + episode list from AnimeKai.
 * @param {string} id — AnimeKai anime ID (e.g. 'steinsgate')
 * @returns {Promise<Object>}
 *   { id, title, episodes: [{id, number, title, isFiller, isSubbed, isDubbed}] }
 */
export async function getAnimekaiInfo(id) {
    const url = `${CONSUMET_API_BASE}/anime/animekai/info?id=${encodeURIComponent(id)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`AnimeKai info failed (${resp.status})`);
    return resp.json();
}

/**
 * Fetch streaming sources for an episode.
 * @param {string} episodeId — episode ID from getAnimekaiInfo
 * @param {boolean} dub — true for dub, false for sub
 * @returns {Promise<{sources: Array<{url, isM3U8}>, subtitles: Array}>}
 */
export async function getEpisodeSources(episodeId, dub = false) {
    const url = `${CONSUMET_API_BASE}/anime/animekai/watch?id=${encodeURIComponent(episodeId)}&server=megaup&dub=${dub}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`AnimeKai watch failed (${resp.status})`);
    return resp.json();
}
