// ─── RENDER ──────────────────────────────────────────────────────────────────
let completedFilter = 'all';

function render() {
  const v = state.view;
  if      (v === 'home')     renderHome();
  else if (v === 'watching') renderShelfView('watching', 'Currently Watching');
  else if (v === 'watchlist') renderShelfView('watchlist', 'Watchlist');
  else if (v === 'watchlater') renderShelfView('watchlater', 'Watch Later');
  else if (v === 'stopped')  renderShelfView('stopped', 'Stopped');
  else if (v === 'completed') renderShelfView('completed', 'All');
  else if (v === 'uptodate') renderUpToDate();
  else if (v === 'finished') renderFinished();
  else if (v === 'activity') renderActivity();
  else if (v === 'profile')  renderProfile();
  else if (v === 'people')   renderPeople();
  else if (v.startsWith('user:')) renderUserProfileView(v.split(':').slice(1).join(':'));
  else if (v.startsWith('list:')) renderCustomList(v.split(':')[1]);
  renderSidebarLists();
}

function renderSidebarLists() {
  const el = document.getElementById('custom-lists-nav');
  el.innerHTML = state.customLists.map(l => `
    <div class="custom-list-row" onclick="navigateToList('${l.id}')">
      <div class="dot" style="background:${l.color}"></div>
      ${escHtml(l.name)}
      <span class="count">${(l.showIds || []).length}</span>
    </div>
  `).join('');
}

// ─── HOME ────────────────────────────────────────────────────────────────────
function renderHome() {
  const watching  = getShows('watching');
  const completed = getShows('completed');
  const watchlist = getShows('watchlist');
  const upToDate  = completed.filter(d => d.show?.status !== 'Ended' && d.show?.status !== 'Canceled');
  const allEps    = Object.values(state.shows).reduce((acc, d) => acc + Object.values(d.watched || {}).filter(Boolean).length, 0);

  let html = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Watching</div>
        <div class="stat-value" style="color:var(--amber)">${watching.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completed</div>
        <div class="stat-value" style="color:var(--accent)">${completed.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Up to Date</div>
        <div class="stat-value" style="color:var(--green)">${upToDate.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Episodes Watched</div>
        <div class="stat-value" style="color:var(--accent2)">${allEps}</div>
      </div>
    </div>`;

  if (watching.length > 0) {
    html += `<div class="section-header"><div class="section-title">Continue Watching</div></div>`;
    html += `<div class="cw-grid">`;
    watching.forEach(d => {
      const show      = d.show;
      const totalEps  = countTotalEps(d);
      const watchedEps = Object.values(d.watched || {}).filter(Boolean).length;
      const pct       = totalEps > 0 ? Math.round(watchedEps / totalEps * 100) : 0;
      const next      = findNextEpisode(d);
      const thumb     = show.poster_path ? IMG_SM + show.poster_path : FALLBACK_IMG;
      const epLabel   = next ? next.label : 'Up to date';
      const tagHtml   = next?.tag
        ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:6px;background:${next.tagColor}22;color:${next.tagColor};margin-left:6px">${next.tag}</span>`
        : '';
      const epKey = next ? (() => {
        const sNums = Object.keys(state.seasons[show.id] || {}).sort((a, b) => +a - +b);
        for (const sn of sNums) {
          for (const ep of (state.seasons[show.id][sn]?.episodes || [])) {
            const k = `${sn}_${ep.episode_number}`;
            if (!d.watched?.[k]) return k;
          }
        }
        return null;
      })() : null;

      html += `
        <div class="cw-card" onclick="openShow(${show.id})">
          <img class="cw-thumb" loading="lazy" decoding="async" src="${thumb}" onerror="this.src='${FALLBACK_IMG}'">
          <div class="cw-info">
            <div>
              <div class="cw-title">${escHtml(show.name)}</div>
              <div class="cw-ep" style="display:flex;align-items:center">${epLabel}${tagHtml}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${watchedEps}/${totalEps} eps · ${pct}%</div>
              <div class="cw-bar-wrap"><div class="cw-bar" style="width:${pct}%"></div></div>
            </div>
          </div>
          ${epKey ? `<button class="cw-quick-btn" onclick="event.stopPropagation();quickMarkEp(${show.id},'${epKey}','${epLabel}')" title="Mark as watched">✓</button>` : ''}
        </div>`;
    });
    html += `</div>`;
  }

  if (watchlist.length > 0) {
    html += `<div class="section-header"><div class="section-title">Up Next</div><span class="section-count">${watchlist.length} shows</span></div>`;
    html += `<div class="show-grid">`;
    watchlist.slice(0, 8).forEach(d => html += showCard(d.show, 'watchlist'));
    html += `</div>`;
  }

  if (!watching.length && !watchlist.length && !completed.length) {
    html += `<div class="empty-state">
      <div class="big">▶</div>
      <h3>Your tracker is empty</h3>
      <p>Search for TV shows above to start tracking your progress</p>
    </div>`;
  }

  document.getElementById('content').innerHTML = html;
}

// ─── SHELF / ALL ─────────────────────────────────────────────────────────────
function renderShelfView(status, title) {
  const c = document.getElementById('content');

  if (status === 'completed') {
    const allShows = Object.values(state.shows);
    const byFilter = {
      all:        allShows,
      watching:   allShows.filter(d => d.status === 'watching'),
      finished:   allShows.filter(d => d.status === 'completed' && (d.show?.status === 'Ended' || d.show?.status === 'Canceled')),
      uptodate:   allShows.filter(d => d.status === 'completed' && d.show?.status !== 'Ended' && d.show?.status !== 'Canceled'),
      stopped:    allShows.filter(d => d.status === 'stopped'),
      watchlater: allShows.filter(d => d.status === 'watchlater'),
      watchlist:  allShows.filter(d => d.status === 'watchlist'),
    };
    const filtered = byFilter[completedFilter] || allShows;

  let html = `<div class="section-header" style="margin-bottom:16px">
    <div class="section-title">${title}</div>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="section-count">${filtered.length} shows</span>
      <button class="btn" style="padding:5px 12px;font-size:12px" onclick="toggleSelectMode()">${window._selectMode ? 'Cancel' : 'Select'}</button>
      ${window._selectMode && window._selectedShows?.size > 0 ? `
        <button class="btn" style="padding:5px 12px;font-size:12px" onclick="moveSelectedShows('stopped')">Stopped</button>
        <button class="btn" style="padding:5px 12px;font-size:12px" onclick="moveSelectedShows('watchlater')">Watch Later</button>
        <button class="btn" style="padding:5px 12px;font-size:12px" onclick="moveSelectedShows('watching')">Watching</button>
        <button class="btn" style="padding:5px 12px;font-size:12px" onclick="moveSelectedShows('completed')">Completed</button>
        <button class="btn danger" style="padding:5px 12px;font-size:12px" onclick="deleteSelectedShows()">Delete (${window._selectedShows.size})</button>
      ` : ''}
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">
        ${['all','watching','uptodate','finished','watchlist'].map(f => `
          <button class="filter-btn${completedFilter === f ? ' active' : ''}" onclick="setCompletedFilter('${f}')">
            ${{ all:'All', watching:'Watching', finished:'Finished', uptodate:'Up to Date', watchlist:'Watchlist' }[f]}
            <span class="filter-count">${byFilter[f].length}</span>
          </button>`).join('')}
      </div>`;

    if (!filtered.length) {
      html += `<div class="empty-state"><div class="big">▶</div><h3>Nothing here</h3><p>No shows match this filter yet</p></div>`;
    } else {
      const PAGE   = window._showPage || 40;
      const visible = filtered.slice(0, PAGE);
      const hasMore = filtered.length > PAGE;
      html += `<div class="show-grid">`;
      visible.forEach(d => {
        const isUpToDate = d.status === 'completed' && d.show?.status !== 'Ended' && d.show?.status !== 'Canceled';
        html += showCard(d.show, isUpToDate ? 'uptodate' : d.status);
      });
      html += `</div>`;
      if (hasMore) {
        html += `<div style="text-align:center;margin-top:24px">
          <button class="btn" style="padding:10px 32px" onclick="window._showPage=${PAGE + 40};renderShelfView('completed','All')">
            Show More (${filtered.length - PAGE} remaining)
          </button>
        </div>`;
      }
    }
    c.innerHTML = html;
    return;
  }

  const shows = getShows(status);
  if (!shows.length) {
    c.innerHTML = `<div class="empty-state">
      <div class="big">${status === 'watchlist' ? '＋' : '▶'}</div>
      <h3>Nothing here yet</h3>
      <p>Search for shows and add them to this list</p>
    </div>`;
    return;
  }
  let html = `<div class="section-header">
    <div class="section-title">${title}</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="section-count">${shows.length} shows</span>
      <button class="btn" style="padding:5px 12px;font-size:12px" onclick="toggleSelectMode()">${window._selectMode ? 'Cancel' : 'Select'}</button>
      ${window._selectMode && window._selectedShows?.size > 0 ? `
        <button class="btn" style="padding:5px 12px;font-size:12px;border-color:rgba(136,136,136,0.4);color:#888" onclick="moveSelectedShows('stopped')">Stopped</button>
        <button class="btn" style="padding:5px 12px;font-size:12px;border-color:rgba(78,205,196,0.4);color:#4ecdc4" onclick="moveSelectedShows('watchlater')">Watch Later</button>
        <button class="btn" style="padding:5px 12px;font-size:12px;border-color:rgba(244,165,52,0.4);color:#f4a534" onclick="moveSelectedShows('watching')">Watching</button>
        <button class="btn" style="padding:5px 12px;font-size:12px;border-color:rgba(124,106,255,0.4);color:#7c6aff" onclick="moveSelectedShows('completed')">Completed</button>
        <button class="btn" style="padding:5px 12px;font-size:12px;border-color:rgba(255,107,107,0.4);color:#ff6b6b" onclick="moveSelectedShows('watchlist')">Watchlist</button>
        <button class="btn danger" style="padding:5px 12px;font-size:12px" onclick="deleteSelectedShows()">Delete (${window._selectedShows.size})</button>
      ` : ''}
    </div>
  </div>`;
  html += `<div class="show-grid">`;
  const PAGE2   = window._showPage || 40;
  const visible2 = shows.slice(0, PAGE2);
  visible2.forEach(d => html += showCard(d.show, status));
  html += `</div>`;
  if (shows.length > PAGE2) {
    html += `<div style="text-align:center;margin-top:24px">
      <button class="btn" style="padding:10px 32px" onclick="window._showPage=${PAGE2 + 40};renderShelfView('${status}','${title}')">
        Show More (${shows.length - PAGE2} remaining)
      </button>
    </div>`;
  }
  c.innerHTML = html;
}

function setCompletedFilter(f) {
  completedFilter = f;
  window._showPage = 40;
  renderShelfView('completed', 'All');
}

// ─── UP TO DATE / FINISHED ───────────────────────────────────────────────────
function renderUpToDate() {
  const c = document.getElementById('content');
  const shows = getShows('completed').filter(d => d.show?.status !== 'Ended' && d.show?.status !== 'Canceled');
  if (!shows.length) {
    c.innerHTML = `<div class="empty-state"><div class="big">↻</div><h3>Nothing here yet</h3><p>Shows you've caught up on that are still airing will appear here</p></div>`;
    return;
  }
  let html = `<div class="section-header"><div class="section-title">Up to Date</div><span class="section-count">${shows.length} shows</span></div><div class="show-grid">`;
  shows.forEach(d => html += showCard(d.show, 'uptodate'));
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}

function renderFinished() {
  const c = document.getElementById('content');
  const shows = getShows('completed').filter(d => d.show?.status === 'Ended' || d.show?.status === 'Canceled');
  if (!shows.length) {
    c.innerHTML = `<div class="empty-state"><div class="big">■</div><h3>Nothing here yet</h3><p>Completed shows that have fully ended will appear here</p></div>`;
    return;
  }
  let html = `<div class="section-header"><div class="section-title">Finished</div><span class="section-count">${shows.length} shows</span></div><div class="show-grid">`;
  shows.forEach(d => html += showCard(d.show, 'completed'));
  html += `</div>`;
  document.getElementById('content').innerHTML = html;
}

// ─── CUSTOM LIST ─────────────────────────────────────────────────────────────
function renderCustomList(id) {
  const list  = state.customLists.find(l => l.id === id);
  if (!list) return;
  const shows = (list.showIds || []).map(sid => state.shows[sid]).filter(Boolean);
  const c = document.getElementById('content');
  let html = `<div class="section-header">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:12px;height:12px;border-radius:50%;background:${list.color}"></div>
      <div class="section-title">${escHtml(list.name)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="section-count">${shows.length} shows</span>
      <button class="btn danger" onclick="deleteList('${id}')" style="padding:6px 12px;font-size:12px">Delete List</button>
    </div>
  </div>`;
  if (!shows.length) {
    html += `<div class="empty-state"><div class="big">≡</div><h3>This list is empty</h3><p>Open a show and add it to <strong>${escHtml(list.name)}</strong></p></div>`;
  } else {
    html += `<div class="show-grid">`;
    shows.forEach(d => html += showCard(d.show, d.status));
    html += `</div>`;
  }
  c.innerHTML = html;
}

// ─── SHOW CARD ───────────────────────────────────────────────────────────────
function showCard(show, status) {
  const d          = state.shows[show.id] || {};
  const totalEps   = countTotalEps(d);
  const watchedEps = Object.values(d.watched || {}).filter(Boolean).length;
  // If completed/uptodate with no episode tracking, assume 100%
  const isCompleted = status === 'completed' || status === 'uptodate';
  const hasNoTracking = watchedEps === 0 && Object.keys(d.watched || {}).length === 0;
  const pct        = isCompleted && hasNoTracking ? 100
    : totalEps > 0 ? Math.round(watchedEps / totalEps * 100) : 0;
  const r          = 14;
  const circ       = 2 * Math.PI * r;
  const offset     = circ - (pct / 100) * circ;
  const badgeMap   = {
    watching:  'Watching', completed: 'Done',
    watchlist: 'Watchlist', uptodate: 'Up to Date',
    watchlater:'Watch Later', stopped: 'Stopped'
  };
  const ringColor  = status === 'uptodate'   ? '#4caf87'
                   : status === 'watching'   ? '#f4a534'
                   : status === 'watchlater' ? '#4ecdc4'
                   : status === 'stopped'    ? '#ff6b6b'
                   : '#7c6aff';
  const img        = show.poster_path ? IMG_SM + show.poster_path : FALLBACK_IMG;  const isSelected = window._selectedShows?.has(String(show.id));
  const inSelectMode = !!window._selectMode;

  return `
    <div class="show-card${isSelected ? ' show-card-selected' : ''}" onclick="${inSelectMode ? `toggleSelectShow(${show.id})` : `openShow(${show.id})`}">
      ${inSelectMode ? `<div class="show-select-check${isSelected ? ' checked' : ''}">
        ${isSelected ? `<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="1.5,6 4.5,9 10.5,3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
      </div>` : ''}
      <img class="show-card-poster" src="${img}" onerror="this.src='${FALLBACK_IMG}'" loading="lazy" decoding="async">
      ${badgeMap[status] ? `<div class="show-card-badge" style="color:${ringColor}">${badgeMap[status]}</div>` : ''}
      <div class="show-card-body">
        <div class="show-card-title">${escHtml(show.name)}</div>
        <div class="show-card-meta">
          <span class="show-card-year">${(show.first_air_date || '').slice(0, 4)}</span>
          ${totalEps > 0 || (isCompleted && hasNoTracking) ? `
          <div class="progress-ring">
            <svg width="34" height="34" viewBox="0 0 34 34">
              <circle cx="17" cy="17" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2.5"/>
              <circle cx="17" cy="17" r="${r}" fill="none" stroke="${ringColor}" stroke-width="2.5"
                stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round"/>
            </svg>
            <div class="pct" style="color:${ringColor}">${pct}%</div>
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

// ─── ACTIVITY ────────────────────────────────────────────────────────────────
function renderActivity() {
  const log = state.activityLog || [];
  const c   = document.getElementById('content');
  if (!log.length) {
    c.innerHTML = `<div class="activity-empty">
      <div class="big">◎</div>
      <h3>No Activity Yet</h3>
      <p>Your actions will appear here as you track shows and episodes</p>
    </div>`;
    return;
  }

  const iconMap    = { ep: '▶', done: '✓', add: '＋', list: '◈', wl: '◈', remove: '✕' };
  const typeLabels = {
    ep:     a => `Watched <span class="show-name">${escHtml(a.detail)}</span> · <strong>${escHtml(a.showName)}</strong>`,
    done:   a => `Marked <strong>${escHtml(a.showName)}</strong> as <span style="color:var(--green);font-weight:600">Completed</span>`,
    add:    a => `Started watching <strong>${escHtml(a.showName)}</strong>`,
    wl:     a => `Added <strong>${escHtml(a.showName)}</strong> to Watchlist`,
    list:   a => `Added <strong>${escHtml(a.showName)}</strong> to list <span style="color:var(--accent3)">${escHtml(a.detail)}</span>`,
    remove: a => `Removed <strong>${escHtml(a.showName)}</strong> from library`,
  };

  const groups = {};
  log.forEach(a => {
    const key = new Date(a.ts).toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  });

  const dayLabel = dateStr => {
    const d   = new Date(dateStr);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d >= now)  return 'Today';
    if (d >= yest) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const timeStr = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let html = `<div class="activity-feed">`;
  Object.entries(groups).forEach(([dayStr, items]) => {
    html += `<div class="activity-day-group"><div class="activity-day-label">${dayLabel(dayStr)}</div>`;
    items.forEach(a => {
      const thumb   = a.posterId ? `${IMG_SM}${a.posterId}` : FALLBACK_IMG;
      const labelFn = typeLabels[a.type];
      const label   = labelFn ? labelFn(a) : escHtml(a.showName);
      html += `
        <div class="activity-item" onclick="a_click(${a.showId})">
          <div class="activity-icon ${a.type}">${iconMap[a.type] || '·'}</div>
          <div class="activity-body">
            <div class="activity-text">${label}</div>
            <div class="activity-time">${timeStr(a.ts)}</div>
          </div>
          <img class="activity-thumb" loading="lazy" decoding="async" src="${thumb}" onerror="this.src='${FALLBACK_IMG}'">
        </div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  c.innerHTML = html;
}

// ─── MODAL: OPEN SHOW ────────────────────────────────────────────────────────
let currentShow = null;
let currentTab  = 'episodes';

async function openShow(id) {
  closeDropdown();

  // ── Show modal instantly with cached data ──────────────────────────────
  let show = state.shows[id]?.show;
  if (show) {
    document.getElementById('show-modal').style.display = 'flex';
    currentShow = show;
    currentTab  = 'episodes';
    if (!window.openSeasons) window.openSeasons = {};
    window.openSeasons[String(id)] = null;
    _populateModal(show, id);
    if (state.seasons[id]) {
      renderModalTab();
    } else {
      document.getElementById('m-tab-content').innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;
    }
  } else {
    // No cache — show spinner
    document.getElementById('show-modal').style.display = 'flex';
    document.getElementById('m-tab-content').innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div></div>`;
    document.getElementById('m-title').textContent = '';
    document.getElementById('m-meta').innerHTML = '';
    document.getElementById('m-genres').innerHTML = '';
    document.getElementById('m-overview').textContent = '';
    document.getElementById('m-actions').innerHTML = '';
    document.getElementById('m-poster').src = FALLBACK_IMG;
  }

  // ── Fetch fresh data + IMDb ID in background ──────────────────────────
  try {
    const [fresh, extIds] = await Promise.all([
      fetchShow(id),
      tmdbFetch(`${TMDB}/tv/${id}/external_ids`).then(r => r.json()).catch(() => ({}))
    ]);
    if (fresh.id) {
      show = fresh;
      show._imdb_id = extIds.imdb_id || null;
      if (state.shows[id]) { state.shows[id].show = show; save(); }
      currentShow = show;
      _populateModal(show, id);
    }
  } catch(e) {
    if (!show) show = { id, name: 'Unknown Show', seasons: [] };
  }

  if (!window.openSeasons) window.openSeasons = {};
  window.openSeasons[String(id)] = null;

  if (!state.seasons[id]) await loadSeasons(id, show);
  checkUpToDate(id);
  renderModalTab();
}

function _populateModal(show, id) {
  const img    = show.poster_path ? IMG_LG + show.poster_path : FALLBACK_IMG;
  const year   = (show.first_air_date || '').slice(0, 4);
  const eps    = show.number_of_episodes ? ` · ${show.number_of_episodes} eps` : '';
  const seas   = show.number_of_seasons  ? `${show.number_of_seasons} seasons` : '';
  const rating = show.vote_average ? show.vote_average.toFixed(1) : null;
  const imdbId = show._imdb_id;
  const imdbBtn = imdbId
    ? `<a class="imdb-inline-btn" href="https://www.imdb.com/title/${imdbId}/" target="_blank" rel="noopener">
        <svg width="28" height="14" viewBox="0 0 52 26" xmlns="http://www.w3.org/2000/svg">
          <rect width="52" height="26" rx="4" fill="#F5C518"/>
          <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="15" font-weight="900" fill="#000">IMDb</text>
        </svg>
      </a>`
    : '';

  document.getElementById('m-poster').src = img;
  document.getElementById('m-title').textContent = show.name || 'Unknown';
  document.getElementById('m-meta').innerHTML = `
    <span>${[seas].filter(Boolean).join(' · ')}${eps}</span>
    <span style="display:inline-flex;align-items:center;gap:8px;margin-left:6px">
      ${rating ? `<span class="rating-badge">★ ${rating}</span>` : ''}
      ${imdbBtn}
    </span>`;
  const startYear = (show.first_air_date || '').slice(0, 4);
  const endYear   = show.last_air_date ? new Date(show.last_air_date).getFullYear() : null;
  const isEnded   = show.status === 'Ended' || show.status === 'Canceled';
  const dateRange = startYear
    ? `<span class="date-range-tag">${startYear} – ${isEnded && endYear ? endYear : 'Present'}</span>`
    : '';

  document.getElementById('m-genres').innerHTML =
    (show.genres || []).map(g => `<span class="genre-tag">${g.name}</span>`).join('') + dateRange;
  document.getElementById('m-overview').textContent = show.overview || '';
  document.getElementById('m-tabs').innerHTML = `
    <div class="tab active" onclick="switchTab('episodes')">Episodes</div>
    <div class="tab" onclick="switchTab('about')">About</div>`;
  renderModalActions(id);
}

function renderModalActions(id) {
  const d             = state.shows[id] || {};
  const status        = d.status;
  const isWatching    = status === 'watching';
  const isCompleted   = status === 'completed';
  const isWatchlist   = status === 'watchlist';
  const isWatchLater  = status === 'watchlater';
  const isStopped     = status === 'stopped';
  const imdbId        = currentShow?._imdb_id;
  let html = '';

  if (!status) {
    html += `<button class="btn primary" onclick="setStatus(${id},'watching')">▶ Start Watching</button>`;
    html += `<button class="btn" onclick="setStatus(${id},'completed')">✓ Mark Completed</button>`;
    html += `<button class="btn" onclick="setStatus(${id},'watchlist')">＋ Watchlist</button>`;
    html += `<button class="btn" onclick="setStatus(${id},'watchlater')">⏲ Watch Later</button>`;
  } else {
    if (!isWatching)   html += `<button class="btn" onclick="setStatus(${id},'watching')">▶ Watching</button>`;
    if (!isCompleted)  html += `<button class="btn" onclick="setStatus(${id},'completed')">✓ Completed</button>`;
    if (!isWatchlist)  html += `<button class="btn" onclick="setStatus(${id},'watchlist')">＋ Watchlist</button>`;
    if (!isWatchLater) html += `<button class="btn" onclick="setStatus(${id},'watchlater')">⏲ Watch Later</button>`;
    if (!isStopped)    html += `<button class="btn" onclick="setStatus(${id},'stopped')">⏸ Stopped</button>`;
    html += `<div style="position:relative">
      <button class="btn" onclick="toggleListDropdown(${id})">+ Add to List</button>
      <div class="dropdown" id="list-dropdown-${id}" style="display:none;top:36px;left:0">
        ${!state.customLists.length
          ? `<div class="dropdown-item" onclick="openNewListModal()">+ New List</div>`
          : state.customLists.map(l => {
              const inList = (l.showIds || []).includes(String(id));
              return `<div class="dropdown-item" onclick="toggleShowInList('${l.id}',${id})">
                <div class="dot" style="background:${l.color}"></div>
                ${escHtml(l.name)} ${inList ? '✓' : ''}
              </div>`;
            }).join('')}
      </div>
    </div>`;
    html += `<button class="btn danger" onclick="removeShow(${id})">Remove</button>`;
  }
  document.getElementById('m-actions').innerHTML = html;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#m-tabs .tab').forEach(el =>
    el.classList.toggle('active', el.textContent.toLowerCase().replace(' ', '') === tab));
  renderModalTab();
}

function renderModalTab() {
  const el = document.getElementById('m-tab-content');
  if (currentTab === 'episodes') renderEpisodesTab(el);
  else renderAboutTab(el);
}

function renderEpisodesTab(el) {
  if (!currentShow) return;
  const id          = currentShow.id;
  const seasonsData = state.seasons[id] || {};
  const showData    = state.shows[id] || {};
  const seasonNums  = Object.keys(seasonsData).sort((a, b) => +a - +b);

  if (!seasonNums.length) { el.innerHTML = `<div class="empty-state"><p>No episode data available</p></div>`; return; }

  if (!window.openSeasons) window.openSeasons = {};
  if (window.openSeasons[String(id)] === undefined) window.openSeasons[String(id)] = null;

  let html = '';
  seasonNums.forEach(snum => {
    const eps          = seasonsData[snum]?.episodes || [];
    const watchedCount = eps.filter(ep => showData.watched?.[`${snum}_${ep.episode_number}`]).length;
    const isOpen       = window.openSeasons[String(id)] === snum;

    html += `<div class="season-block">
      <div class="season-label" onclick="toggleSeason('${id}','${snum}')">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text-muted);display:inline-block;transform:rotate(${isOpen ? '90' : '0'}deg);transition:transform 0.2s">▶</span>
          <span>Season ${snum}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px" onclick="event.stopPropagation()">
          <span class="season-progress">${watchedCount}/${eps.length}</span>
          <button class="season-check-all" onclick="markSeasonWatched(${id},${snum},${watchedCount < eps.length})">
            ${watchedCount < eps.length ? 'Mark all' : 'Unmark all'}
          </button>
        </div>
      </div>
      <div class="episode-list" style="display:${isOpen ? 'flex' : 'none'};flex-direction:column">
        ${eps.map(ep => {
          const key  = `${snum}_${ep.episode_number}`;
          const done = !!showData.watched?.[key];
          const date = ep.air_date ? new Date(ep.air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          return `<div class="episode-row" onclick="toggleEp(${id},'${key}')">
            <div class="ep-check${done ? ' done' : ''}"></div>
            <div class="ep-num">${ep.episode_number}</div>
            <div class="ep-title">${escHtml(ep.name || 'Episode ' + ep.episode_number)}</div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
              ${date ? `<div class="ep-runtime" style="color:var(--text-muted)">${date}</div>` : ''}
              ${ep.runtime ? `<div class="ep-runtime">${ep.runtime}m</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

function renderAboutTab(el) {
  const show   = currentShow;
  if (!show) return;
  const network = (show.networks || []).map(n => n.name).join(', ') || '—';
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      ${[['Network', network], ['Status', show.status||'—'], ['Type', show.type||'—'], ['Language', (show.original_language||'').toUpperCase()||'—']
        ].map(([k, v]) => `
        <div style="background:var(--bg-elevated);border-radius:10px;padding:12px 14px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">${k}</div>
          <div style="font-size:14px;font-weight:500">${escHtml(v)}</div>
        </div>`).join('')}
    </div>
    <div style="background:var(--bg-elevated);border-radius:10px;padding:14px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Overview</div>
      <div style="font-size:14px;line-height:1.7;color:var(--text-secondary)">${escHtml(show.overview || 'No description available.')}</div>
    </div>`;
}

function toggleSeason(id, snum) {
  if (!window.openSeasons) window.openSeasons = {};
  window.openSeasons[id] = window.openSeasons[id] === snum ? null : snum;
  renderEpisodesTab(document.getElementById('m-tab-content'));
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function renderProfile() {
  const c = document.getElementById('content');

  const allShows       = Object.values(state.shows);
  const totalShows     = allShows.length;
  const watchingCount  = allShows.filter(d => d.status === 'watching').length;
  const completedCount = allShows.filter(d => d.status === 'completed').length;
  const watchlistCount = allShows.filter(d => d.status === 'watchlist').length;
  const finishedCount  = allShows.filter(d => d.status === 'completed' && (d.show?.status === 'Ended' || d.show?.status === 'Canceled')).length;

  const now    = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US',{month:'short'}), eps: 0, mins: 0 });
  }

  // FIX: Count total watched episodes directly from state (accurate, not capped like activityLog).
  // activityLog is used only for time estimates and monthly chart data.
  let totalEpsWatched = 0;
  Object.values(state.shows).forEach(d => {
    totalEpsWatched += Object.values(d.watched || {}).filter(Boolean).length;
  });

  let totalMinutes = 0;
  (state.activityLog || []).forEach(a => {
    if (a.type !== 'ep') return;
    const d      = new Date(a.ts);
    const bucket = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth());
    let runtime  = 0;
    if (a.showId && a.detail) {
      const match = a.detail.match(/^S(\d+)E(\d+)/);
      if (match) {
        const ep = state.seasons[a.showId]?.[match[1]]?.episodes?.find(e => e.episode_number === parseInt(match[2]));
        runtime  = ep?.runtime || 0;
      }
    }
    totalMinutes += runtime;
    if (bucket) { bucket.eps++; bucket.mins += runtime; }
  });

  function formatWatchTime(mins) {
    const hours   = Math.floor(mins / 60);
    const days    = Math.floor(hours / 24);
    const mo      = Math.floor(days / 30);
    const remDays = days % 30;
    const remHrs  = hours % 24;
    return `<span class="time-num">${mo}</span><span class="time-unit"> Month${mo!==1?'s':''} </span><span class="time-num">${remDays}</span><span class="time-unit"> Day${remDays!==1?'s':''} </span><span class="time-num">${remHrs}</span><span class="time-unit"> Hour${remHrs!==1?'s':''}</span>`;
  }

  function buildChart(data, color, gradId) {
    const max = Math.max(...data.map(d => d.val), 1);
    const W = 760, H = 150, PAD = 10, BAR_W = 36;
    const GAP = (W - PAD * 2 - BAR_W * data.length) / (data.length - 1);
    const bars = data.map((d, i) => {
      const barH = Math.max((d.val / max) * (H - 24), d.val > 0 ? 4 : 0);
      const x = PAD + i * (BAR_W + GAP);
      const y = H - 18 - barH;
      return { x, y, barH, val: d.val, label: d.label };
    });
    return `<svg viewBox="0 0 ${W} ${H+16}" xmlns="http://www.w3.org/2000/svg" style="width:100%;overflow:visible;display:block">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <line x1="${PAD}" y1="${H-18}" x2="${W-PAD}" y2="${H-18}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      ${bars.map(b => `<g>
        <rect x="${b.x}" y="${b.y}" width="${BAR_W}" height="${b.barH}" rx="5" fill="url(#${gradId})"/>
        ${b.val>0?`<text x="${b.x+BAR_W/2}" y="${b.y-5}" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="9" font-family="Plus Jakarta Sans,sans-serif">${b.val}</text>`:''}
        <text x="${b.x+BAR_W/2}" y="${H+12}" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="10" font-family="Plus Jakarta Sans,sans-serif">${b.label}</text>
      </g>`).join('')}
    </svg>`;
  }

  const epsData = months.map(m => ({ label: m.label, val: m.eps }));
  const hrsData = months.map(m => ({ label: m.label, val: Math.round(m.mins/60) }));

  const uname    = currentUsername || (currentUser?.email || 'User');
  const initial  = uname[0].toUpperCase();
  const joinDate = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-US', { month:'long', year:'numeric' }) : '';
  const profilePic = state.profilePic || null;

  // Background blur from first favorite poster
  const firstFav = (state.favorites||[]).find(id => state.shows[id]?.show?.backdrop_path);
  const heroBg   = firstFav && state.shows[firstFav]?.show?.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${state.shows[firstFav].show.backdrop_path}`
    : null;

  const favsHtml = [0,1,2,3].map(i => {
    const fid  = (state.favorites||[])[i];
    const fd   = fid ? state.shows[fid] : null;
    const show = fd?.show;
    if (show) {
      const img = show.poster_path ? IMG+show.poster_path : FALLBACK_IMG;      return `<div class="fav-card fav-filled" onclick="openShow(${show.id})">
        <img src="${img}" class="fav-poster" loading="lazy" decoding="async" onerror="this.src='${FALLBACK_IMG}'">
        <div class="fav-overlay">
          <div class="fav-title">${escHtml(show.name)}</div>
          <button class="fav-remove-btn" onclick="event.stopPropagation();removeFavorite(${i})">✕</button>
        </div>
      </div>`;
    }
    return `<div class="fav-card fav-empty" onclick="openFavoritePicker(${i})">
      <div class="fav-plus">＋</div>
      <div class="fav-add-label">Add Favorite</div>
    </div>`;
  }).join('');

  c.innerHTML = `
  <input type="file" id="pic-input" accept="image/*" style="display:none" onchange="handlePicUpload(event)">
  <input type="file" id="tvtime-csv-input" accept=".csv" style="display:none" onchange="handleTVTimeImport(event)">

  <!-- ── HERO ── -->
  <div class="prof2-hero" style="${heroBg ? `background-image:url('${heroBg}')` : ''}">
    <div class="prof2-hero-overlay"></div>
    <div class="prof2-hero-inner">

      <!-- Avatar -->
      <div class="prof2-avatar-wrap" onclick="document.getElementById('pic-input').click()" title="Change photo">
        ${profilePic
          ? `<img src="${profilePic}" class="prof2-avatar-img">`
          : `<div class="prof2-avatar-initial">${initial}</div>`}
        <div class="prof2-avatar-edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
      </div>

      <!-- Info -->
      <div class="prof2-info">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="prof2-username">@${escHtml(uname)}</div>
          <button onclick="showChangeUsernameModal()" title="Change username" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 8px;cursor:pointer;display:flex;align-items:center;gap:5px;color:rgba(255,255,255,0.55);font-size:12px;transition:background 0.15s" onmouseenter="this.style.background='rgba(255,255,255,0.14)'" onmouseleave="this.style.background='rgba(255,255,255,0.08)'">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Edit
          </button>
        </div>
        <div class="prof2-email">${escHtml(currentUser?.email||'')}</div>
        ${joinDate ? `<div class="prof2-since">Member since ${joinDate}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="tvtime-import-btn" onclick="document.getElementById('tvtime-csv-input').click()">
            Import from TV Time
          </button>
          <button class="tvtime-import-btn" style="border-color:rgba(255,91,91,0.35);color:rgba(255,100,100,0.8)" onclick="confirmClearLibrary()">
            Clear Library
          </button>
        </div>
      </div>

      <!-- Quick stats in hero -->
      <div class="prof2-hero-stats">
        <div class="prof2-hstat"><div class="prof2-hstat-num">${totalShows}</div><div class="prof2-hstat-label">Shows</div></div>
        <div class="prof2-hstat-div"></div>
        <div class="prof2-hstat"><div class="prof2-hstat-num">${totalEpsWatched}</div><div class="prof2-hstat-label">Episodes</div></div>
        <div class="prof2-hstat-div"></div>
        <div class="prof2-hstat"><div class="prof2-hstat-num">${Math.round(totalMinutes/60)}</div><div class="prof2-hstat-label">Hours</div></div>
      </div>
    </div>
  </div>

  <!-- ── BODY ── -->
  <div class="prof2-body">

    <!-- Left column -->
    <div class="prof2-left">

      <!-- Favorites -->
      <div class="prof2-card">
        <div class="prof2-card-label">Favorite Shows</div>
        <div class="fav-grid" style="max-width:100%;margin-top:14px">${favsHtml}</div>
      </div>

      <!-- Time card -->
      <div class="prof2-card">
        <div class="prof2-card-label">Time Spent Watching</div>
        <div class="prof-time-value" style="font-size:32px;margin-top:10px">${formatWatchTime(totalMinutes)}</div>
      </div>

      <!-- Status breakdown -->
      <div class="prof2-card">
        <div class="prof2-card-label">Top Genres</div>
        <div class="prof2-breakdown">
          ${(() => {
            const genreCount = {};
            allShows.forEach(d => {
              (d.show?.genres || []).forEach(g => {
                genreCount[g.name] = (genreCount[g.name] || 0) + 1;
              });
            });
            const sorted = Object.entries(genreCount).sort((a,b) => b[1]-a[1]).slice(0, 6);
            const maxVal = sorted[0]?.[1] || 1;
            const colors = ['#7c6aff','#4ecdc4','#f4a534','#ff6b6b','#4caf87','#ef5fa7'];
            if (!sorted.length) return `<div style="color:var(--text-muted);font-size:13px;padding:10px 0">Add shows to see genre breakdown</div>`;
            return sorted.map(([genre, count], i) => {
              const pct = Math.round(count / maxVal * 100);
              return `<div class="prof2-bk-row">
                <div class="prof2-bk-label">
                  <span class="prof2-bk-dot" style="background:${colors[i]}"></span>${escHtml(genre)}
                </div>
                <div class="prof2-bk-right">
                  <div class="prof2-bk-bar-wrap">
                    <div class="prof2-bk-bar" style="width:${pct}%;background:${colors[i]}"></div>
                  </div>
                  <span class="prof2-bk-num">${count}</span>
                </div>
              </div>`;
            }).join('');
          })()}
        </div>
      </div>

    </div>

    <!-- Right column: Charts -->
    <div class="prof2-right">
      <div class="prof2-card">
        <div class="prof2-chart-hdr">
          <div>
            <div class="prof2-card-label">Episodes per Month</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Last 12 months</div>
          </div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#7c6aff;letter-spacing:1px">${totalEpsWatched}</div>
        </div>
        ${buildChart(epsData,'#7c6aff','grad-eps2')}
      </div>

      <div class="prof2-card">
        <div class="prof2-chart-hdr">
          <div>
            <div class="prof2-card-label">Hours per Month</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Last 12 months</div>
          </div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#4ecdc4;letter-spacing:1px">${Math.round(totalMinutes/60)} hrs</div>
        </div>
        ${buildChart(hrsData,'#4ecdc4','grad-hrs2')}
      </div>
    </div>
  </div>

  <!-- FAVORITE PICKER -->
  <div class="modal-overlay" id="fav-picker-modal" style="display:none" onclick="if(event.target===this)closeFavoritePicker()">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <div class="modal-info"><div class="modal-title">Pick a Favorite</div></div>
        <button class="modal-close" onclick="closeFavoritePicker()">×</button>
      </div>
      <div class="modal-body" style="max-height:420px;overflow-y:auto">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px;padding:4px">
          ${allShows.filter(d=>d.show).map(d => {
            const img     = d.show.poster_path ? IMG+d.show.poster_path : FALLBACK_IMG;
            const already = (state.favorites||[]).includes(String(d.show.id));
            return `<div class="fav-pick-item${already?' fav-pick-taken':''}" onclick="setFavorite(window._favSlot,${d.show.id})">
              <img src="${img}" onerror="this.src='${FALLBACK_IMG}'" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:8px;display:block">
              <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escHtml(d.show.name)}</div>
              ${already?`<div style="font-size:10px;color:var(--text-muted);text-align:center">Already added</div>`:''}
            </div>`;
          }).join('')}
          ${allShows.length===0 ? `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No shows in your library yet</div>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

// ─── PEOPLE ───────────────────────────────────────────────────────────────────
async function renderPeople() {
  if (!window._upCache) window._upCache = {};
  const c = document.getElementById('content');
  const followingList = Object.entries(_following);

  let html = `
    <div class="section-header" style="margin-bottom:16px">
      <div class="section-title">People</div>
    </div>
    <div class="people-search-wrap">
      <input type="text" class="input-field" id="people-search-input"
        placeholder="Search by username…"
        oninput="onPeopleSearch(this.value)"
        autocomplete="off">
    </div>
    <div id="people-results"></div>`;

  if (followingList.length > 0) {
    html += `<div class="section-header" style="margin-top:28px;margin-bottom:12px">
      <div class="section-title" style="font-size:15px">Following</div>
      <span class="section-count">${followingList.length}</span>
    </div>
    <div class="people-grid">`;
    followingList.forEach(([uid, info]) => {
      html += renderUserCard({ uid, username: info.username, profilePic: info.profilePic });
    });
    html += `</div>`;
  }

  html += `
    <div class="section-header" style="margin-top:28px;margin-bottom:12px">
      <div class="section-title" style="font-size:15px">All Users</div>
    </div>
    <div id="people-discover">
      <div style="text-align:center;padding:30px"><div class="spinner"></div></div>
    </div>`;

  c.innerHTML = html;
  setTimeout(() => document.getElementById('people-search-input')?.focus(), 50);

  const users = await loadDiscoverUsers();
  const el = document.getElementById('people-discover');
  if (!el) return;
  if (!users.length) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:14px;padding:12px 0">No other users yet</div>`;
    return;
  }
  el.innerHTML = `<div class="people-grid">${users.map(u => renderUserCard(u)).join('')}</div>`;
}

function renderUserCard(user) {
  if (!window._upCache) window._upCache = {};
  window._upCache[user.uid] = Object.assign(window._upCache[user.uid] || {}, user);
  const pic      = user.profilePic;
  const initial  = (user.username || '?')[0].toUpperCase();
  const stats    = user.stats || {};
  const following = isFollowing(user.uid);
  return `
    <div class="people-card" onclick="viewUser('${user.uid}')">
      <div class="people-avatar">
        ${pic ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<span>${initial}</span>`}
      </div>
      <div class="people-info">
        <div class="people-username">@${escHtml(user.username || '')}</div>
        ${stats.totalShows ? `<div class="people-stats">${stats.totalShows} shows · ${stats.totalEps || 0} eps</div>` : ''}
      </div>
      <button class="people-follow-btn${following ? ' following' : ''}" data-uid="${user.uid}"
        onclick="event.stopPropagation();toggleFollow('${user.uid}')">
        ${following ? '✓ Following' : '+ Follow'}
      </button>
    </div>`;
}

async function renderUserProfileView(uid) {
  const c = document.getElementById('content');
  c.innerHTML = `<div style="text-align:center;padding:80px"><div class="spinner"></div></div>`;

  if (!window._upCache) window._upCache = {};
  let profile = window._upCache[uid];
  if (!profile || !profile.shows) {
    profile = await loadUserProfile(uid);
    if (profile) window._upCache[uid] = profile;
  }

  if (!profile) {
    c.innerHTML = `<div class="empty-state"><div class="big">◉</div><h3>Profile not found</h3><p>This user hasn't set up their public profile yet.</p></div>`;
    return;
  }

  const following = isFollowing(uid);
  const pic       = profile.profilePic;
  const uname     = profile.username || uid;
  const initial   = uname[0].toUpperCase();
  const stats     = profile.stats || {};
  const shows     = profile.shows || [];
  const watching  = shows.filter(s => s.status === 'watching');
  const completed = shows.filter(s => s.status === 'completed');
  const activity  = profile.activityLog || [];

  const iconMap = { ep:'▶', done:'✓', add:'＋', list:'◈', wl:'◈', remove:'✕' };
  const typeLabels = {
    ep:     a => `Watched ${escHtml(a.detail || '')} · <strong>${escHtml(a.showName || '')}</strong>`,
    done:   a => `Marked <strong>${escHtml(a.showName || '')}</strong> as Completed`,
    add:    a => `Started watching <strong>${escHtml(a.showName || '')}</strong>`,
    wl:     a => `Added <strong>${escHtml(a.showName || '')}</strong> to Watchlist`,
    list:   a => `Added <strong>${escHtml(a.showName || '')}</strong> to list ${escHtml(a.detail || '')}`,
    remove: a => `Removed <strong>${escHtml(a.showName || '')}</strong>`,
  };
  const dateStr = ts => new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' });

  const showMini = s => {
    const img = s.poster_path ? IMG_SM + s.poster_path : FALLBACK_IMG;
    return `<div class="up-show-card" title="${escHtml(s.name)}">
      <img src="${img}" onerror="this.src='${FALLBACK_IMG}'" loading="lazy" decoding="async">
      <div class="up-show-name">${escHtml(s.name)}</div>
    </div>`;
  };

  c.innerHTML = `
    <div class="up-hero">
      <div class="up-hero-inner">
        <div class="up-avatar">
          ${pic ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<span>${initial}</span>`}
        </div>
        <div class="up-info">
          <div class="up-username">@${escHtml(uname)}</div>
          <div class="up-stats-row">
            <span>${stats.totalShows || 0} shows</span>
            <span class="up-dot">·</span>
            <span>${stats.totalEps || 0} episodes</span>
            <span class="up-dot">·</span>
            <span>${stats.watching || 0} watching</span>
          </div>
        </div>
        <button id="follow-btn-${uid}" class="btn${following ? '' : ' primary'}"
          onclick="toggleFollow('${uid}')">
          ${following ? '✓ Following' : '+ Follow'}
        </button>
      </div>
    </div>

    <div class="up-body">
      <div class="up-section">
        <div class="prof2-card-label" style="margin-bottom:14px">Recent Activity</div>
        ${activity.length ? activity.slice(0, 20).map(a => {
          const fn  = typeLabels[a.type];
          const lbl = fn ? fn(a) : escHtml(a.showName || '');
          return `<div class="up-activity-item">
            <div class="activity-icon ${a.type}">${iconMap[a.type] || '·'}</div>
            <div class="up-activity-text">${lbl}</div>
            <div class="up-activity-time">${dateStr(a.ts)}</div>
          </div>`;
        }).join('') : `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No activity yet</div>`}
      </div>

      <div class="up-section">
        <div class="prof2-card-label" style="margin-bottom:14px">Currently Watching (${watching.length})</div>
        ${watching.length
          ? `<div class="up-shows-grid">${watching.map(showMini).join('')}</div>`
          : `<div style="color:var(--text-muted);font-size:13px">Nothing watching right now</div>`}
        ${completed.length ? `
          <div class="prof2-card-label" style="margin-top:20px;margin-bottom:14px">Completed (${completed.length})</div>
          <div class="up-shows-grid">${completed.slice(0, 12).map(showMini).join('')}</div>` : ''}
      </div>
    </div>`;
}
