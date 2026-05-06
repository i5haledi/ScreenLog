// ─── TMDB API ────────────────────────────────────────────────────────────────
let searchTimeout   = null;
let _searchCache    = {}; // keyed by show id → show object for current search

async function fetchShow(id) {
  const r = await tmdbFetch(`${TMDB}/tv/${id}`);
  return r.json();
}

async function fetchSeason(showId, seasonNum) {
  const r = await tmdbFetch(`${TMDB}/tv/${showId}/season/${seasonNum}`);
  return r.json();
}

async function loadSeasons(id, show) {
  const seasons = (show.seasons || []).filter(s => s.season_number > 0);
  state.seasons[id] = {};
  await Promise.all(seasons.map(async s => {
    try {
      state.seasons[id][s.season_number] = await fetchSeason(id, s.season_number);
    } catch(e) {
      state.seasons[id][s.season_number] = { episodes: [] };
    }
  }));
  save();
  syncSaveSeasons(id);
  // Refresh home / upcoming views so the episode label appears
  if (state.view === 'home' || state.view === 'upcoming') render();
}

async function searchShows(q) {
  const r = await tmdbFetch(`${TMDB}/search/tv?query=${encodeURIComponent(q)}&page=1`);
  const data = await r.json();
  return (data.results || []).slice(0, 8);
}

// ─── SEARCH UI ───────────────────────────────────────────────────────────────
async function onSearchInput() {
  const q = document.getElementById('search-input').value.trim();
  const box = document.getElementById('search-results');
  clearTimeout(searchTimeout);
  if (q.length < 2) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = `<div style="padding:16px;text-align:center"><div class="spinner"></div></div>`;
  searchTimeout = setTimeout(() => doSearch(q), 350);
}

async function doSearch(q) {
  const box = document.getElementById('search-results');
  _searchCache = {};
  try {
    const results = await searchShows(q);
    if (!results.length) {
      box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No shows found</div>`;
      return;
    }
    results.forEach(s => { _searchCache[s.id] = s; });
    box.innerHTML = results.map(s => {
      const img   = s.poster_path ? IMG_SM + s.poster_path : FALLBACK_IMG;
      const year  = (s.first_air_date || '').slice(0, 4);
      const inLib = !!state.shows[s.id];
      return `<div class="search-result-item" data-id="${s.id}" role="option">
        <img src="${img}" alt="${escHtml(s.name)} poster" onerror="this.src='${FALLBACK_IMG}'">
        <div class="sri-info">
          <div class="sri-title">${escHtml(s.name)}</div>
          <div class="sri-sub">${year || 'Unknown year'}</div>
        </div>
        <div class="sri-actions">
          ${inLib
            ? `<button class="btn-xs active-btn" data-action="view" aria-label="View ${escHtml(s.name)}">View</button>`
            : `<button class="btn-xs primary" data-action="watch" aria-label="Add ${escHtml(s.name)} to watching">+ Watch</button>
               <button class="btn-xs" data-action="watchlist" aria-label="Add ${escHtml(s.name)} to watchlist">◈</button>`
          }
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('Search failed:', e);
    box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Search error. Try again.</div>`;
  }
}

async function fetchShowImages(showId) {
  return tmdbFetch(`${TMDB}/tv/${showId}/images`).then(r => r.json()).catch(() => ({}));
}

function addShowFromSearch(show, status) {
  state.shows[show.id] = { show, status, watched: {} };
  save();
  syncSaveShow(show.id); // FIX: sync the new show to Firestore
  render();
  closeSearch();
  openShow(show.id);
}

function openShowFromSearch(show) {
  closeSearch();
  openShow(show.id);
}

function closeSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').style.display = 'none';
  _searchCache = {};
}

// ─── SEARCH RESULTS EVENT DELEGATION ─────────────────────────────────────────
document.getElementById('search-results').addEventListener('click', e => {
  const item = e.target.closest('.search-result-item[data-id]');
  if (!item) return;
  const show = _searchCache[item.dataset.id];
  if (!show) return;

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'watch')     { e.stopPropagation(); addShowFromSearch(show, 'watching'); }
  else if (action === 'watchlist') { e.stopPropagation(); addShowFromSearch(show, 'watchlist'); }
  else if (action === 'view') { e.stopPropagation(); openShowFromSearch(show); }
  else openShowFromSearch(show);
});
