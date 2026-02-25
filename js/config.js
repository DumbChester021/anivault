/**
 * config.js — Centralized configuration
 *
 * All API endpoints and app-wide settings live here.
 * Update these values when deploying to a new environment.
 */

// Jikan API (MyAnimeList unofficial API)
export const JIKAN_API_BASE = 'https://api.jikan.moe/v4';

// Hianime API (aniwatch-api) — self-hosted instance
export const HIANIME_API_BASE = 'https://anivault-hianime-api.vercel.app';

// MegaPlay embed player
export const MEGAPLAY_BASE = 'https://megaplay.buzz/stream/s-2';

// NSFW genre IDs to filter out in SFW mode (Hentai, Erotica)
export const NSFW_GENRE_IDS = [12, 49];
