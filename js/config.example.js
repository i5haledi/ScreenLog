// ─── TMDB API CONFIG ────────────────────────────────────────────────────────
// Copy this file to config.js and fill in your own credentials.
// Get a free API key at https://www.themoviedb.org/settings/api
//
// SECURITY NOTE: This is a frontend-only app, so the TMDB key is visible
// in the browser. TMDB read-only keys carry low risk, but for production
// consider proxying requests through a backend to keep keys off the client.
const TMDB_KEY   = 'YOUR_TMDB_API_KEY';
const TMDB_TOKEN = 'YOUR_TMDB_BEARER_TOKEN';
const TMDB       = 'https://api.themoviedb.org/3';
const IMG        = 'https://image.tmdb.org/t/p/w500';
const IMG_SM     = 'https://image.tmdb.org/t/p/w342';
const IMG_LG     = 'https://image.tmdb.org/t/p/w780';
const HEADERS    = { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'Content-Type': 'application/json' };

const FALLBACK_IMG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgMTAwIDE1MCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxNTAiIGZpbGw9IiMyMjI2M2EiLz48cmVjdCB4PSIzNSIgeT0iNTUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIyMCIgcng9IjMiIGZpbGw9IiM0YTRkNjYiLz48cmVjdCB4PSIyNSIgeT0iNzgiIHdpZHRoPSI1MCIgaGVpZ2h0PSIzIiByeD0iMiIgZmlsbD0iIzRhNGQ2NiIvPjwvc3ZnPg==';

const COLORS = ['#7c6aff', '#ff6b6b', '#4ecdc4', '#f4a534', '#66bb6a', '#ef5fa7', '#42a5f5'];

function tmdbFetch(url) {
  return fetch(url, { headers: HEADERS });
}
