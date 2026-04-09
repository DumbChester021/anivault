/**
 * config.js — Centralized configuration
 *
 * All API endpoints and app-wide settings live here.
 * Update these values when deploying to a new environment.
 */

// Jikan API (MyAnimeList unofficial API)
export const JIKAN_API_BASE = 'https://api.jikan.moe/v4';

// Consumet API — locally hosted for testing
export const CONSUMET_API_BASE = 'http://localhost:3001';

// NSFW genre IDs to filter out in SFW mode (Hentai, Erotica)
export const NSFW_GENRE_IDS = [12, 49];
