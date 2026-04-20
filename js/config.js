/**
 * config.js — Centralized configuration
 *
 * All API endpoints and app-wide settings live here.
 * Update these values when deploying to a new environment.
 */

// Jikan API (MyAnimeList unofficial API)
export const JIKAN_API_BASE = 'https://api.jikan.moe/v4';

// Consumet API — local dev hits same host on :3001, deployed Vercel hits /api/consumet proxy
const _isLocal = typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || /^192\.168\./.test(location.hostname) || /^10\./.test(location.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname));
export const CONSUMET_API_BASE = _isLocal ? `http://${location.hostname}:3001` : '/api/consumet';
export const CONSUMET_ENV = _isLocal ? 'LOCAL' : 'VERCEL_PROXY';

// NSFW genre IDs to filter out in SFW mode (Hentai, Erotica)
export const NSFW_GENRE_IDS = [12, 49];

// Supabase — copy js/env.example.js → js/env.js and fill in your project values.
// Run supabase-schema.sql in the Supabase SQL editor before first use.
export { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';
