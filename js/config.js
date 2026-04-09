/**
 * config.js — Centralized configuration
 *
 * All API endpoints and app-wide settings live here.
 * Update these values when deploying to a new environment.
 */

// Jikan API (MyAnimeList unofficial API)
export const JIKAN_API_BASE = 'https://api.jikan.moe/v4';

// Consumet API — routed through our Vercel serverless proxy to avoid CORS.
// The proxy at /api/consumet/[...path].js forwards requests to the upstream.
export const CONSUMET_API_BASE = '/api/consumet';

// NSFW genre IDs to filter out in SFW mode (Hentai, Erotica)
export const NSFW_GENRE_IDS = [12, 49];
