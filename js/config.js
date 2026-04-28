// ─── TMDB API CONFIG ────────────────────────────────────────────────────────
const TMDB_KEY   = 'c36841756abaddba1427c5e6bcb55d31';
const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjMzY4NDE3NTZhYmFkZGJhMTQyN2M1ZTZiY2I1NWQzMSIsIm5iZiI6MTY0MTc0NjM0Mi40NzcsInN1YiI6IjYxZGIwZmE2YWY0MzI0MDAxZTg2Yzg0NiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ._oC1eLNB3mkfDm8U5CQ8nse4aiFE8J2Aw5M7-xyA_Ag';
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
