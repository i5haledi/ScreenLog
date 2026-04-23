// ─── TMDB API ────────────────────────────────────────────────────────────────
let searchTimeout = null;

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
  try {
    const results = await searchShows(q);
    if (!results.length) {
      box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No shows found</div>`;
      return;
    }
    box.innerHTML = results.map(s => {
      const img = s.poster_path ? IMG + s.poster_path : FALLBACK_IMG;
      const year = (s.first_air_date || '').slice(0, 4);
      const inLib = !!state.shows[s.id];
      return `<div class="search-result-item" onclick="openShowFromSearch(${JSON.stringify(s).replace(/"/g, '&quot;')})">
        <img src="${img}" onerror="this.src='${FALLBACK_IMG}'">
        <div class="sri-info">
          <div class="sri-title">${escHtml(s.name)}</div>
          <div class="sri-sub">${year || 'Unknown year'}</div>
        </div>
        <div class="sri-actions" onclick="event.stopPropagation()">
          ${inLib
            ? `<button class="btn-xs active-btn" onclick="openShowFromSearch(${JSON.stringify(s).replace(/"/g, '&quot;')})">View</button>`
            : `<button class="btn-xs primary" onclick="addShowFromSearch(${JSON.stringify(s).replace(/"/g, '&quot;')}, 'watching')">+ Watch</button>
               <button class="btn-xs" onclick="addShowFromSearch(${JSON.stringify(s).replace(/"/g, '&quot;')}, 'watchlist')">◈</button>`
          }
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Search error. Try again.</div>`;
  }
}

function addShowFromSearch(show, status) {
  state.shows[show.id] = { show, status, watched: {} };
  save(); render();
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
}
