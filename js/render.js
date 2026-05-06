// ─── RENDER ──────────────────────────────────────────────────────────────────
let completedFilter = 'all';

function render() {
  const v = state.view;
  if      (v === 'home')     renderHome();
  else if (v === 'watching') renderShelfView('watching', 'Currently Watching');
  else if (v === 'watchlist') renderShelfView('watchlist', 'Watchlist');
  else if (v === 'watchlater') { completedFilter = 'watchlater'; renderShelfView('completed', 'All'); }
  else if (v === 'stopped')    { completedFilter = 'stopped';    renderShelfView('completed', 'All'); }
  else if (v === 'completed')  renderShelfView('completed', 'All');
  else if (v === 'uptodate')   { completedFilter = 'uptodate';   renderShelfView('completed', 'All'); }
  else if (v === 'finished')   { completedFilter = 'finished';   renderShelfView('completed', 'All'); }
  else if (v === 'activity') renderActivity();
  else if (v === 'upcoming') renderUpcoming();
  else if (v === 'profile')  renderProfile();
  else if (v === 'people')   renderPeople();
  else if (v === 'settings') renderSettings();
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
  const watchlist = getShows('watchlist');

  let html = ``;

  if (watching.length > 0) {
    html += `<div class="section-header"><div class="section-title">Continue Watching</div></div>`;
    html += `<div class="cw-scroll">`;
    watching.forEach(d => {
      const show      = d.show;
      const totalEps  = countTotalEps(d);
      const watchedEps = Object.values(d.watched || {}).filter(Boolean).length;
      const pct       = totalEps > 0 ? Math.round(watchedEps / totalEps * 100) : 0;
      const next      = findNextEpisode(d);
      const thumb     = show.poster_path ? IMG_SM + show.poster_path : FALLBACK_IMG;
      const hasSeasonsData = state.seasons[show.id] && Object.keys(state.seasons[show.id]).length > 0;
      const epLabel   = next ? next.label : (hasSeasonsData ? 'Up to date' : null);
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
        <div class="cw-swipe-wrap">
          ${epKey ? `<div class="cw-swipe-bg">✓ Watched</div>` : ''}
          <div class="cw-card"${epKey ? ` data-showid="${show.id}" data-epkey="${epKey}" data-eplabel="${escHtml(epLabel)}"` : ''} onclick="openShow(${show.id})">
            <div class="cw-poster-wrap">
              <img class="cw-thumb" loading="lazy" decoding="async" src="${thumb}" onerror="this.src='${FALLBACK_IMG}'">
              <div class="cw-bar-wrap"><div class="cw-bar" style="width:${pct}%"></div></div>
            </div>
            <div class="cw-info">
              <div class="cw-title">${escHtml(show.name)}</div>
              <div class="cw-ep" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                ${epLabel === null ? '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;display:inline-block;vertical-align:middle"></span>' : `<span>${escHtml(epLabel)}</span>`}
                ${next?.tag ? `<span class="cw-tag" style="color:${next.tagColor};background:${next.tagColor}22">${next.tag}</span>` : ''}
              </div>
              ${epKey ? `<button class="cw-quick-btn" onclick="event.stopPropagation();quickMarkEp(${show.id},'${epKey}','${epLabel}')" title="Mark episode as watched">✓ Mark watched</button>` : ''}
            </div>
          </div>
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

  if (!watching.length && !watchlist.length && !Object.keys(state.shows).length) {
    html += `<div class="empty-state">
      <div class="big">▶</div>
      <h3>Your tracker is empty</h3>
      <p>Search for TV shows above to start tracking your progress</p>
    </div>`;
  }

  document.getElementById('content').innerHTML = html;
  initCwSwipe();

  if (!window._fetchingSeasons) window._fetchingSeasons = new Set();
  watching.forEach(d => {
    const show = d.show;
    if (!show) return;
    const id = String(show.id);
    if ((!state.seasons[show.id] || !Object.keys(state.seasons[show.id]).length) && !window._fetchingSeasons.has(id)) {
      window._fetchingSeasons.add(id);
      loadSeasons(show.id, show).then(() => window._fetchingSeasons.delete(id));
    }
  });
}

// ─── SWIPE TO MARK (mobile) ──────────────────────────────────────────────────
function initCwSwipe() {
  if (window.innerWidth > 640) return;
  document.querySelectorAll('.cw-card[data-epkey]').forEach(card => {
    const bg = card.previousElementSibling; // .cw-swipe-bg
    const threshold = card.offsetWidth * 0.45;
    let startX = 0, startY = 0, currentX = 0;
    let isTracking = false, isHorizontal = null;

    card.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0; isTracking = true; isHorizontal = null;
      card.style.transition = 'none';
      if (bg) bg.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (!isTracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (isHorizontal === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isHorizontal = Math.abs(dx) > Math.abs(dy);
        if (!isHorizontal) { isTracking = false; return; }
      }
      if (!isHorizontal) return;
      currentX = Math.max(0, dx);
      card.style.transform = `translateX(${currentX}px)`;
      if (bg) bg.style.opacity = Math.min(currentX / threshold, 1);
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (!isTracking) return;
      isTracking = false;
      card.style.transition = 'transform 0.25s ease';
      if (bg) bg.style.transition = 'opacity 0.25s ease';
      if (currentX >= threshold) {
        card.style.transform = `translateX(110%)`;
        const showId = +card.dataset.showid;
        const epKey  = card.dataset.epkey;
        const epLabel = card.dataset.eplabel;
        setTimeout(() => quickMarkEp(showId, epKey, epLabel), 250);
      } else {
        card.style.transform = '';
        if (bg) bg.style.opacity = 0;
      }
    });
  });
}

// ─── SHELF / ALL ─────────────────────────────────────────────────────────────
function renderShelfView(status, title) {
  const c = document.getElementById('content');

  if (status === 'completed') {
    if (!window._allSearch) window._allSearch = { q: '', mode: 'name' };
    const { q: searchQ, mode: searchMode } = window._allSearch;

    const allShows = Object.values(state.shows);
    const byFilter = {
      all:        allShows,
      watching:   allShows.filter(d => d.status === 'watching'),
      watchlist:  allShows.filter(d => d.status === 'watchlist'),
      watchlater: allShows.filter(d => d.status === 'watchlater'),
      stopped:    allShows.filter(d => d.status === 'stopped'),
      uptodate:   allShows.filter(d => d.status === 'completed' && d.show?.status !== 'Ended' && d.show?.status !== 'Canceled'),
      finished:   allShows.filter(d => d.status === 'completed' && (d.show?.status === 'Ended' || d.show?.status === 'Canceled')),
    };
    let filtered = byFilter[completedFilter] || allShows;

    if (searchQ.trim()) {
      const sq = searchQ.toLowerCase();
      filtered = filtered.filter(d => {
        const show = d.show;
        if (!show) return false;
        if (searchMode === 'name')    return show.name?.toLowerCase().includes(sq);
        if (searchMode === 'network') return (show.networks || []).some(n => n.name?.toLowerCase().includes(sq));
        if (searchMode === 'cast')    return (show._credits?.cast || []).some(p => p.name?.toLowerCase().includes(sq));
        return true;
      });
    }

    const modePlaceholders = { name: 'show name…', network: 'network name…', cast: 'actor or actress…' };

  let html = `<div class="section-header" style="margin-bottom:16px">
    <div class="section-title">${title}</div>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="section-count">${filtered.length} show${filtered.length !== 1 ? 's' : ''}</span>
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
  <div class="lib-search-wrap">
    <div class="lib-mode-pills">
      ${['name','network','cast'].map(m => `
        <button class="lib-mode-btn${searchMode===m?' active':''}" onclick="setAllSearchMode('${m}')">
          ${{name:'By Name',network:'By Network',cast:'By Cast'}[m]}
        </button>`).join('')}
    </div>
    <div class="lib-search-input-wrap">
      <span class="lib-search-icon">⌕</span>
      <input type="text" class="lib-search-input" id="lib-search-input"
        placeholder="Search ${modePlaceholders[searchMode]}"
        value="${escHtml(searchQ)}"
        oninput="setAllSearchQuery(this.value)"
        autocomplete="off">
      ${searchQ ? `<button class="lib-search-clear" onclick="clearAllSearch()" title="Clear search">×</button>` : ''}
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">
        ${['all','watching','watchlist','watchlater','stopped','uptodate','finished'].map(f => `
          <button class="filter-btn${completedFilter === f ? ' active' : ''}" onclick="setCompletedFilter('${f}')">
            ${{ all:'All', watching:'Watching', watchlist:'Watchlist', watchlater:'Watch Later', stopped:'Stopped', uptodate:'Up to Date', finished:'Finished' }[f]}
            <span class="filter-count">${byFilter[f].length}</span>
          </button>`).join('')}
      </div>`;

    if (!filtered.length) {
      const emptyMsg = searchQ.trim()
        ? `<div class="empty-state"><div class="big">⌕</div><h3>No results</h3><p>No shows match "<strong>${escHtml(searchQ)}</strong>" — try a different search or mode</p></div>`
        : `<div class="empty-state"><div class="big">▶</div><h3>Nothing here</h3><p>No shows match this filter yet</p></div>`;
      html += emptyMsg;
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
    if (searchQ) {
      const inp = document.getElementById('lib-search-input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
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
  const img        = show.poster_path ? IMG + show.poster_path : FALLBACK_IMG;
  const isSelected = window._selectedShows?.has(String(show.id));
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
    done:   a => `Marked <strong>${escHtml(a.showName)}</strong> as <span style="color:var(--green);font-weight:600">watched</span>`,
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
    items.forEach((a, idx) => {
      const thumb   = a.posterId ? `${IMG_SM}${a.posterId}` : FALLBACK_IMG;
      const labelFn = typeLabels[a.type];
      const label   = labelFn ? labelFn(a) : escHtml(a.showName);
      const isLast  = idx === items.length - 1;
      html += `
        <div class="activity-item" onclick="a_click(${a.showId})">
          <div class="activity-tl-node">
            <div class="activity-icon ${a.type}">${iconMap[a.type] || '·'}</div>
            ${!isLast ? '<div class="activity-tl-line"></div>' : ''}
          </div>
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
    const [fresh, extIds, credits] = await Promise.all([
      fetchShow(id),
      tmdbFetch(`${TMDB}/tv/${id}/external_ids`).then(r => r.json()).catch(() => ({})),
      tmdbFetch(`${TMDB}/tv/${id}/credits`).then(r => r.json()).catch(() => ({}))
    ]);
    if (fresh.id) {
      show = fresh;
      show._imdb_id = extIds.imdb_id || null;
      show._credits = credits;
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
  if (state.shows[id]?.status === 'completed') {
    const tvStatus = state.shows[id]?.show?.status;
    if (tvStatus === 'Ended' || tvStatus === 'Canceled') ensureAllEpsMarked(id);
  }
  checkUpToDate(id);
  renderModalTab();
}

function _populateModal(show, id) {
  const customPoster = state.shows[id]?.customPoster;
  const img = customPoster ? IMG_LG + customPoster : (show.poster_path ? IMG_LG + show.poster_path : FALLBACK_IMG);
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

  window._currentShowId = id;
  document.getElementById('m-poster').src = img;
  const editBtn = document.getElementById('m-poster-edit-btn');
  if (editBtn) editBtn.style.display = state.shows[id] ? 'block' : 'none';
  document.getElementById('m-meta').innerHTML = `
    <span>${[seas].filter(Boolean).join(' · ')}${eps}</span>
    <span style="display:inline-flex;align-items:center;gap:8px;margin-left:6px">
      ${rating ? `<span class="rating-badge">★ ${rating}</span>` : ''}
      ${imdbBtn}
    </span>`;
  const startYear = (show.first_air_date || '').slice(0, 4);
  const endYear   = show.last_air_date ? new Date(show.last_air_date).getFullYear() : null;
  const isEnded   = show.status === 'Ended' || show.status === 'Canceled';
  const dateLabel = startYear
    ? `${startYear}${isEnded && endYear ? `–${endYear}` : '–Present'}`
    : '';

  const titleEl = document.getElementById('m-title');
  titleEl.innerHTML = `${escHtml(show.name || 'Unknown')}${dateLabel ? `<span class="date-range-tag" style="vertical-align:middle;margin-left:10px">${dateLabel}</span>` : ''}`;

  document.getElementById('m-genres').innerHTML =
    (show.genres || []).map(g => `<span class="genre-tag">${g.name}</span>`).join('');
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

  const today = new Date(); today.setHours(23, 59, 59, 999);

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
      <div class="episode-list" style="display:${isOpen ? 'flex' : 'none'};flex-direction:column;gap:4px">
        ${eps.map(ep => {
          const key     = `${snum}_${ep.episode_number}`;
          const done    = !!showData.watched?.[key];
          const rating  = showData.ratings?.[key] || 0;
          const date    = ep.air_date ? new Date(ep.air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const isAired = ep.air_date ? new Date(ep.air_date) <= today : true;
          const stillSrc = ep.still_path ? IMG_STILL + ep.still_path : null;
          const stars = [1,2,3,4,5].map(n =>
            `<span class="ep-star${rating >= n ? ' filled' : ''}"
              onclick="event.stopPropagation();rateEp(${id},'${key}',${n === rating ? 0 : n})">★</span>`
          ).join('');
          return `<div class="ep-card${done ? ' watched' : ''}">
            <div class="ep-still-wrap"${!isAired ? ' style="opacity:0.45"' : ''}>
              ${stillSrc
                ? `<img src="${stillSrc}" loading="lazy" decoding="async" onerror="this.style.display='none'">`
                : `<div class="ep-still-placeholder">${ep.episode_number}</div>`}
            </div>
            <div class="ep-card-body">
              <div class="ep-card-head">
                <span class="ep-card-num">E${ep.episode_number}</span>
                <span class="ep-card-title">${escHtml(ep.name || 'Episode ' + ep.episode_number)}</span>
              </div>
              <div class="ep-card-meta">
                ${date ? `<span>${date}</span>` : ''}
                ${ep.runtime ? `<span>${ep.runtime}m</span>` : ''}
                ${!isAired ? `<span style="color:var(--accent)">Upcoming</span>` : ''}
              </div>
              <div class="ep-card-actions">
                <div class="ep-stars" id="ep-stars-${id}-${key}">${stars}</div>
                <button class="ep-comment-btn" onclick="event.stopPropagation();openComments(${id},'${snum}',${ep.episode_number})">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  Comment
                </button>
              </div>
            </div>
            <div class="ep-card-check${done ? ' done' : ''}" onclick="toggleEp(${id},'${key}')"></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

function renderAboutTab(el) {
  const show = currentShow;
  if (!show) return;

  const langMap = {
    en:'English', es:'Spanish', fr:'French', de:'German', it:'Italian',
    ja:'Japanese', ko:'Korean', zh:'Chinese', pt:'Portuguese', ru:'Russian',
    ar:'Arabic', hi:'Hindi', nl:'Dutch', sv:'Swedish', tr:'Turkish',
    pl:'Polish', da:'Danish', fi:'Finnish', no:'Norwegian', cs:'Czech',
    el:'Greek', ro:'Romanian', hu:'Hungarian', id:'Indonesian', th:'Thai',
    he:'Hebrew', uk:'Ukrainian', vi:'Vietnamese', ms:'Malay'
  };

  const network     = (show.networks || []).map(n => n.name).join(', ') || '—';
  const langDisplay = langMap[show.original_language] || (show.original_language || '').toUpperCase() || '—';
  const cast        = (show._credits?.cast || []).slice(0, 12);
  const IMG_FACE    = 'https://image.tmdb.org/t/p/w185';

  const infoItems = [
    ['Network',  network],
    ['Status',   show.status || '—'],
    ['Language', langDisplay],
  ];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${infoItems.map(([k, v]) => `
        <div style="background:var(--bg-elevated);border-radius:10px;padding:12px 14px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">${k}</div>
          <div style="font-size:14px;font-weight:500">${escHtml(v)}</div>
        </div>`).join('')}
    </div>
    ${cast.length ? `
    <div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;text-transform:uppercase;letter-spacing:0.5px">Cast</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${cast.map(p => {
          const photo   = p.profile_path ? `${IMG_FACE}${p.profile_path}` : null;
          const initial = escHtml((p.name || '?')[0].toUpperCase());
          return `<div style="text-align:center;width:60px">
            <div style="width:60px;height:60px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);margin-bottom:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center">
              ${photo
                ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" decoding="async">`
                : `<span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--text-muted)">${initial}</span>`}
            </div>
            <div style="font-size:10px;color:var(--text-secondary);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(p.name)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}`;
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
  const watchingCount  = allShows.filter(d => d.status === 'watching').length;
  const completedCount = allShows.filter(d => d.status === 'completed').length;
  const finishedCount  = allShows.filter(d => d.status === 'completed' && (d.show?.status === 'Ended' || d.show?.status === 'Canceled')).length;

  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US',{month:'short'}), eps: 0, mins: 0 });
  }

  let totalEpsWatched = 0;
  Object.values(state.shows).forEach(d => {
    totalEpsWatched += Object.values(d.watched || {}).filter(Boolean).length;
  });

  let totalMinsAllWatched = 0;
  Object.entries(state.shows).forEach(([showId, d]) => {
    Object.entries(d.watched || {}).forEach(([key, watched]) => {
      if (!watched) return;
      const parts = key.split('_');
      const ep = state.seasons[showId]?.[parts[0]]?.episodes?.find(e => e.episode_number === parseInt(parts[1]));
      if (ep?.runtime) totalMinsAllWatched += ep.runtime;
    });
  });

  let totalMinsLog = 0;
  (state.activityLog || []).forEach(a => {
    if (a.type !== 'ep') return;
    const d      = new Date(a.ts);
    const bucket = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth());
    let runtime  = 0;
    if (a.showId && a.detail) {
      const match = a.detail.match(/^S(\d+)E(\d+)/);
      if (match) {
        const ep = state.seasons[a.showId]?.[match[1]]?.episodes?.find(e => e.episode_number === parseInt(match[2]));
        runtime = ep?.runtime || 0;
      }
    }
    totalMinsLog += runtime;
    if (bucket) { bucket.eps++; bucket.mins += runtime; }
  });

  const totalTrackedEps = (state.activityLog || []).filter(a => a.type === 'ep').length;

  function watchTimeDisplay(mins) {
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    const mo    = Math.floor(days / 30);
    const remD  = days % 30;
    const remH  = hours % 24;
    if (mo > 0) return `<span class="pp-wt-num">${mo}</span><span class="pp-wt-unit"> Mo</span> <span class="pp-wt-num">${remD}</span><span class="pp-wt-unit"> Day${remD!==1?'s':''}</span> <span class="pp-wt-num">${remH}</span><span class="pp-wt-unit"> Hr${remH!==1?'s':''}</span>`;
    if (days > 0) return `<span class="pp-wt-num">${days}</span><span class="pp-wt-unit"> Day${days!==1?'s':''}</span> <span class="pp-wt-num">${remH}</span><span class="pp-wt-unit"> Hr${remH!==1?'s':''}</span>`;
    return `<span class="pp-wt-num">${hours}</span><span class="pp-wt-unit"> Hr${hours!==1?'s':''}</span> <span class="pp-wt-num">${mins%60}</span><span class="pp-wt-unit"> Min</span>`;
  }

  function buildLineChart(data, color, gradId) {
    const W = 520, H = 130, PX = 8, PY = 18, BT = 22;
    const cH = H - PY - BT, cW = W - PX * 2;
    const max = Math.max(...data.map(d => d.val), 1);
    const pts = data.map((d, i) => ({
      x: PX + (i / (data.length - 1)) * cW,
      y: PY + (1 - d.val / max) * cH,
      val: d.val, label: d.label
    }));
    let line = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i-1].x + pts[i].x) / 2;
      line += ` C ${cpx},${pts[i-1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    const area = `${line} L ${pts[pts.length-1].x},${H-BT} L ${pts[0].x},${H-BT} Z`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;overflow:visible">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gradId})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((p, i) => `
        <circle cx="${p.x}" cy="${p.y}" r="${p.val > 0 ? 3 : 1.5}" fill="${p.val > 0 ? color : 'rgba(255,255,255,0.08)'}" stroke="${p.val > 0 ? 'rgba(0,0,0,0.6)' : 'none'}" stroke-width="1.5"/>
        ${p.val > 0 ? `<text x="${p.x}" y="${p.y - 7}" text-anchor="middle" fill="${color}" font-size="8.5" font-family="Thmanyah Sans,sans-serif" font-weight="600">${p.val}</text>` : ''}
        ${i % 2 === 0 || data.length <= 6 || i === data.length - 1 ? `<text x="${p.x}" y="${H - 5}" text-anchor="middle" fill="rgba(255,255,255,0.22)" font-size="9" font-family="Thmanyah Sans,sans-serif">${p.label}</text>` : ''}
      `).join('')}
    </svg>`;
  }

  const epsData = months.map(m => ({ label: m.label, val: m.eps }));
  const hrsData = months.map(m => ({ label: m.label, val: Math.round(m.mins/60) }));

  const uname      = currentUsername || (currentUser?.email || 'User');
  const initial    = uname[0].toUpperCase();
  const joinDate   = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-US', { month:'long', year:'numeric' }) : '';
  const profilePic  = state.profilePic || null;
  const bannerColor = state.profileBannerColor || '#0d0f1a';

  const genreCount = {};
  allShows.forEach(d => { (d.show?.genres || []).forEach(g => { genreCount[g.name] = (genreCount[g.name] || 0) + 1; }); });
  const topGenres = Object.entries(genreCount).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const maxGenre  = topGenres[0]?.[1] || 1;
  const GCOLS     = ['#7c6aff','#4ecdc4','#f4a534','#ff6b6b','#4caf87','#ef5fa7'];

  const favsHtml = [0,1,2,3].map(i => {
    const fid = (state.favorites||[])[i];
    const fd  = fid ? state.shows[fid] : null;
    const show = fd?.show;
    if (show) {
      const img = show.poster_path ? IMG+show.poster_path : FALLBACK_IMG;
      return `<div class="pp-fav pp-fav-filled" onclick="openShow(${show.id})">
        <img src="${img}" loading="lazy" decoding="async" onerror="this.src='${FALLBACK_IMG}'" style="width:100%;height:100%;object-fit:cover;display:block">
        <div class="pp-fav-overlay">
          <div class="pp-fav-title">${escHtml(show.name)}</div>
          <button class="pp-fav-rm" onclick="event.stopPropagation();removeFavorite(${i})">✕</button>
        </div>
      </div>`;
    }
    return `<div class="pp-fav pp-fav-empty" onclick="openFavoritePicker(${i})">
      <div class="pp-fav-plus">＋</div>
    </div>`;
  }).join('');

  c.innerHTML = `
  <input type="file"  id="pic-input"          accept="image/*" style="display:none" onchange="handlePicUpload(event)">
  <input type="color" id="banner-color-input" value="${bannerColor}" style="display:none" oninput="setBannerColor(this.value)">

  <div class="pp-wrap">

    <!-- ── HERO ── -->
    <div class="pp-hero" style="background:${bannerColor}">
      <div class="pp-hero-grad"></div>
      <button class="pp-color-btn" onclick="document.getElementById('banner-color-input').click()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17 12c0 4-3 7-7 7S3 16 3 12 6 5 10 5"/><path d="M21 3L9 15"/></svg>
        Theme
      </button>
      <div class="pp-hero-inner">
        <div class="pp-avatar" onclick="document.getElementById('pic-input').click()">
          ${profilePic ? `<img src="${profilePic}" class="pp-avatar-img">` : `<div class="pp-avatar-init">${initial}</div>`}
          <div class="pp-avatar-edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"/></svg></div>
        </div>
        <div class="pp-hero-info">
          <div class="pp-hero-name">${escHtml(uname)}</div>
          <div class="pp-hero-handle">@${escHtml(uname)}</div>
          ${joinDate ? `<div class="pp-hero-since">Member since ${joinDate}</div>` : ''}
          <div class="pp-follow-row">
            <span class="pp-follow-stat" onclick="openFollowModal('following','${currentUser?.uid}')">
              <strong>${Object.keys(_following).length}</strong> Following
            </span>
            <span class="pp-follow-stat" id="pp-follower-count-stat" onclick="openFollowModal('followers','${currentUser?.uid}')">
              <strong id="pp-follower-num">···</strong> Followers
            </span>
          </div>
        </div>
        <div class="pp-hero-stats">
          <div class="pp-hstat"><div class="pp-hstat-v">${allShows.length}</div><div class="pp-hstat-l">Shows</div></div>
          <div class="pp-hdiv"></div>
          <div class="pp-hstat"><div class="pp-hstat-v">${totalEpsWatched}</div><div class="pp-hstat-l">Episodes</div></div>
          <div class="pp-hdiv"></div>
          <div class="pp-hstat"><div class="pp-hstat-v">${Math.round(totalMinsAllWatched/60)}</div><div class="pp-hstat-l">Hours</div></div>
        </div>
      </div>
    </div>

    <!-- ── STAT STRIP ── -->
    <div class="pp-stat-strip">
      <div class="pp-stat" style="--c:#f4a534">
        <div class="pp-stat-ic" style="background:rgba(244,165,52,0.12);color:#f4a534">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <div><div class="pp-stat-v">${watchingCount}</div><div class="pp-stat-l">Watching</div></div>
      </div>
      <div class="pp-stat" style="--c:#4caf87">
        <div class="pp-stat-ic" style="background:rgba(76,175,135,0.12);color:#4caf87">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div><div class="pp-stat-v">${completedCount}</div><div class="pp-stat-l">Up to Date</div></div>
      </div>
      <div class="pp-stat" style="--c:#7c6aff">
        <div class="pp-stat-ic" style="background:rgba(124,106,255,0.12);color:#7c6aff">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </div>
        <div><div class="pp-stat-v">${finishedCount}</div><div class="pp-stat-l">Finished</div></div>
      </div>
      <div class="pp-stat" style="--c:#4ecdc4">
        <div class="pp-stat-ic" style="background:rgba(78,205,196,0.12);color:#4ecdc4">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div><div class="pp-stat-v">${totalEpsWatched}</div><div class="pp-stat-l">Episodes</div></div>
      </div>
    </div>

    <!-- ── MAIN GRID ── -->
    <div class="pp-grid">

      <!-- LEFT -->
      <div class="pp-col">

        <div class="pp-card">
          <div class="pp-card-head">
            <span class="pp-card-ttl">Favorite Shows</span>
            <span style="font-size:11px;color:var(--text-muted)">Click to change</span>
          </div>
          <div class="pp-favs">${favsHtml}</div>
        </div>

        <div class="pp-card">
          <div class="pp-card-head"><span class="pp-card-ttl">Top Genres</span></div>
          ${topGenres.length
            ? `<div class="pp-genres">${topGenres.map(([name, count], i) => {
                const pct = Math.round(count / maxGenre * 100);
                return `<div class="pp-genre-row">
                  <div class="pp-genre-dot" style="background:${GCOLS[i]}"></div>
                  <div class="pp-genre-name">${escHtml(name)}</div>
                  <div class="pp-genre-bar-bg"><div class="pp-genre-bar" style="width:${pct}%;background:${GCOLS[i]}"></div></div>
                  <div class="pp-genre-n">${count}</div>
                </div>`;
              }).join('')}</div>`
            : `<div style="font-size:13px;color:var(--text-muted);padding:6px 0">Add more shows to see genre breakdown</div>`}
        </div>

      </div>

      <!-- RIGHT -->
      <div class="pp-col">

        <div class="pp-card pp-wt-card">
          <div class="pp-card-head"><span class="pp-card-ttl">Time Spent Watching</span></div>
          <div class="pp-wt">${watchTimeDisplay(totalMinsAllWatched)}</div>
          <div class="pp-wt-sub">Across all episodes</div>
        </div>

        <div class="pp-card">
          <div class="pp-chart-hdr">
            <div>
              <div class="pp-card-ttl">Activity</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px">Last 12 months</div>
            </div>
            <div class="pp-chart-tabs">
              <button class="pp-ctab pp-ctab-active" id="pp-ctab-eps"
                onclick="document.getElementById('pp-chart-eps').style.display='block';document.getElementById('pp-chart-hrs').style.display='none';this.classList.add('pp-ctab-active');document.getElementById('pp-ctab-hrs').classList.remove('pp-ctab-active')">
                Episodes <span class="pp-ctab-n">${totalTrackedEps}</span>
              </button>
              <button class="pp-ctab" id="pp-ctab-hrs"
                onclick="document.getElementById('pp-chart-hrs').style.display='block';document.getElementById('pp-chart-eps').style.display='none';this.classList.add('pp-ctab-active');document.getElementById('pp-ctab-eps').classList.remove('pp-ctab-active')">
                Hours <span class="pp-ctab-n">${Math.round(totalMinsLog/60)}</span>
              </button>
            </div>
          </div>
          <div id="pp-chart-eps">${buildLineChart(epsData,'#7c6aff','pp-grad-eps')}</div>
          <div id="pp-chart-hrs" style="display:none">${buildLineChart(hrsData,'#4ecdc4','pp-grad-hrs')}</div>
        </div>

      </div>
    </div>

  </div>

  <!-- FAVORITE PICKER MODAL -->
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

  // Async load follower count
  if (currentUser) {
    loadFollowerCount(currentUser.uid).then(count => {
      const el = document.getElementById('pp-follower-num');
      if (el) el.textContent = count;
    });
  }
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

  if (!window._upFilter) window._upFilter = {};
  if (!window._upFilter[uid]) window._upFilter[uid] = 'all';

  const following = isFollowing(uid);
  const pic       = profile.profilePic;
  const uname     = profile.username || uid;
  const initial   = uname[0].toUpperCase();
  const stats     = profile.stats || {};
  const shows     = profile.shows || [];
  const activity  = profile.activityLog || [];
  const favorites = profile.favorites || [];

  const iconMap = { ep:'▶', done:'✓', add:'＋', list:'◈', wl:'◈', remove:'✕' };
  const typeLabels = {
    ep:     a => `Watched ${escHtml(a.detail || '')} · <strong>${escHtml(a.showName || '')}</strong>`,
    done:   a => `Marked <strong>${escHtml(a.showName || '')}</strong> as <span style="color:var(--green);font-weight:600">watched</span>`,
    add:    a => `Started watching <strong>${escHtml(a.showName || '')}</strong>`,
    wl:     a => `Added <strong>${escHtml(a.showName || '')}</strong> to Watchlist`,
    list:   a => `Added <strong>${escHtml(a.showName || '')}</strong> to list ${escHtml(a.detail || '')}`,
    remove: a => `Removed <strong>${escHtml(a.showName || '')}</strong>`,
  };
  const dateStr = ts => {
    const d = new Date(ts);
    const now = new Date(); now.setHours(0,0,0,0);
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const day = new Date(d); day.setHours(0,0,0,0);
    if (day.getTime() === now.getTime())  return 'Today';
    if (day.getTime() === yest.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  };

  const _isUpToDate = s => s.status === 'completed' && s.show_status !== 'Ended' && s.show_status !== 'Canceled';
  const _isFinished = s => s.status === 'completed' && (s.show_status === 'Ended' || s.show_status === 'Canceled');

  const showMini = s => {
    const img = s.poster_path ? IMG_SM + s.poster_path : FALLBACK_IMG;
    const disp = _isUpToDate(s) ? 'uptodate' : s.status;
    const badgeColor = { watching:'#f4a534', uptodate:'#4caf87', completed:'#7c6aff', watchlist:'#4ecdc4', watchlater:'#4ecdc4', stopped:'#ff6b6b' }[disp] || '#888';
    const badgeLabel = { watching:'Watching', uptodate:'Up to Date', completed:'Finished', watchlist:'Watchlist', watchlater:'Watch Later', stopped:'Stopped' }[disp] || '';
    return `<div class="up-show-card" onclick="openShow(${s.id})" style="cursor:pointer">
      <div style="position:relative">
        <img src="${img}" onerror="this.src='${FALLBACK_IMG}'" loading="lazy" decoding="async" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:8px;display:block;border:1px solid var(--border)">
        ${badgeLabel ? `<div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;font-weight:700;color:${badgeColor};text-shadow:0 1px 3px rgba(0,0,0,0.8)">${badgeLabel}</div>` : ''}
      </div>
      <div class="up-show-name">${escHtml(s.name)}</div>
    </div>`;
  };

  const favsHtml = [0,1,2,3].map(i => {
    const fid  = favorites[i];
    const show = fid ? shows.find(s => String(s.id) === String(fid)) : null;
    if (show) {
      const img = show.poster_path ? IMG + show.poster_path : FALLBACK_IMG;
      return `<div class="fav-card fav-filled" onclick="openShow(${show.id})">
        <img src="${img}" class="fav-poster" loading="lazy" decoding="async" onerror="this.src='${FALLBACK_IMG}'">
        <div class="fav-overlay"><div class="fav-title">${escHtml(show.name)}</div></div>
      </div>`;
    }
    return `<div class="fav-card fav-empty" style="cursor:default;pointer-events:none;opacity:0.4">
      <div class="fav-plus" style="font-size:18px;color:var(--text-muted)">◻</div>
    </div>`;
  }).join('');

  const filterCounts = {
    all:        shows.length,
    watching:   shows.filter(s => s.status === 'watching').length,
    uptodate:   shows.filter(_isUpToDate).length,
    completed:  shows.filter(_isFinished).length,
    watchlist:  shows.filter(s => s.status === 'watchlist').length,
    watchlater: shows.filter(s => s.status === 'watchlater').length,
    stopped:    shows.filter(s => s.status === 'stopped').length,
  };
  const filterLabels = { all:'All', watching:'Watching', uptodate:'Up to Date', completed:'Finished', watchlist:'Watchlist', watchlater:'Watch Later', stopped:'Stopped' };

  const _filterShows = (arr, f) => {
    if (f === 'all')       return arr;
    if (f === 'uptodate')  return arr.filter(_isUpToDate);
    if (f === 'completed') return arr.filter(_isFinished);
    return arr.filter(s => s.status === f);
  };

  const renderShowGrid = f => {
    const filtered = _filterShows(shows, f);
    if (!filtered.length) return `<div style="color:var(--text-muted);font-size:13px;padding:16px 0">No shows here yet</div>`;
    return `<div class="up-shows-grid" style="grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:10px">${filtered.map(showMini).join('')}</div>`;
  };

  const currentFilter = window._upFilter[uid];

  c.innerHTML = `
  <!-- HERO (same layout as own profile) -->
  <div class="prof2-hero">
    <div class="prof2-hero-overlay"></div>
    <div class="prof2-hero-inner">
      <div class="prof2-avatar-wrap" style="cursor:default">
        ${pic
          ? `<img src="${pic}" class="prof2-avatar-img">`
          : `<div class="prof2-avatar-initial">${initial}</div>`}
      </div>
      <div class="prof2-info">
        <div class="prof2-username">@${escHtml(uname)}</div>
        <div class="prof2-since" style="margin-top:4px">${stats.watching || 0} watching · ${stats.completed || 0} completed · ${stats.watchlist || 0} watchlist</div>
        <div class="prof2-follow-row">
          <span class="prof2-follow-stat" onclick="openFollowModal('following','${uid}')">
            <strong id="prof2-following-num-${uid}">···</strong> Following
          </span>
          <span class="prof2-follow-stat" onclick="openFollowModal('followers','${uid}')">
            <strong id="prof2-follower-num-${uid}">···</strong> Followers
          </span>
        </div>
        <div style="margin-top:12px">
          <button id="follow-btn-${uid}" class="btn${following ? '' : ' primary'}"
            onclick="toggleFollow('${uid}')">
            ${following ? '✓ Following' : '+ Follow'}
          </button>
        </div>
      </div>
      <div class="prof2-hero-stats">
        <div class="prof2-hstat"><div class="prof2-hstat-num">${stats.totalShows || 0}</div><div class="prof2-hstat-label">Shows</div></div>
        <div class="prof2-hstat-div"></div>
        <div class="prof2-hstat"><div class="prof2-hstat-num">${stats.totalEps || 0}</div><div class="prof2-hstat-label">Episodes</div></div>
        <div class="prof2-hstat-div"></div>
        <div class="prof2-hstat"><div class="prof2-hstat-num">${stats.watching || 0}</div><div class="prof2-hstat-label">Watching</div></div>
        <div class="prof2-hstat-div"></div>
        <div class="prof2-hstat"><div class="prof2-hstat-num">${stats.completed || 0}</div><div class="prof2-hstat-label">Completed</div></div>
      </div>
    </div>
  </div>

  <!-- BODY (same two-column layout) -->
  <div class="prof2-body">

    <!-- Left: Favorites + Stats + Activity -->
    <div class="prof2-left">
      <div class="prof2-card">
        <div class="prof2-card-label">Favorite Shows</div>
        <div class="fav-grid" style="max-width:100%;margin-top:14px">${favsHtml}</div>
      </div>

      <!-- Status breakdown -->
      <div class="prof2-card">
        <div class="prof2-card-label">Library Stats</div>
        <div class="prof2-breakdown">
          ${[
            ['Watching',   stats.watching  || 0, '#f4a534'],
            ['Completed',  stats.completed || 0, '#7c6aff'],
            ['Watchlist',  stats.watchlist || 0, '#4ecdc4'],
          ].map(([label, count, color]) => {
            const maxVal = Math.max(stats.watching||0, stats.completed||0, stats.watchlist||0, 1);
            const pct = Math.round(count / maxVal * 100);
            return `<div class="prof2-bk-row">
              <div class="prof2-bk-label">
                <span class="prof2-bk-dot" style="background:${color}"></span>${label}
              </div>
              <div class="prof2-bk-right">
                <div class="prof2-bk-bar-wrap">
                  <div class="prof2-bk-bar" style="width:${pct}%;background:${color}"></div>
                </div>
                <span class="prof2-bk-num">${count}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="prof2-card">
        <div class="prof2-card-label" style="margin-bottom:14px">Recent Activity</div>
        ${activity.length ? `<div class="up-timeline">${activity.slice(0, 20).map((a, idx, arr) => {
          const fn  = typeLabels[a.type];
          const lbl = fn ? fn(a) : escHtml(a.showName || '');
          const isLast = idx === arr.length - 1;
          return `<div class="up-timeline-entry">
            <div class="up-timeline-left">
              <div class="activity-icon ${a.type}">${iconMap[a.type] || '·'}</div>
              ${isLast ? '' : '<div class="up-timeline-bar"></div>'}
            </div>
            <div class="up-timeline-body">
              <div class="up-activity-text">${lbl}</div>
              <div class="up-activity-time">${dateStr(a.ts)}</div>
            </div>
          </div>`;
        }).join('')}</div>` : `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No activity yet</div>`}
      </div>
    </div>

    <!-- Right: Full library with filters -->
    <div class="prof2-right">
      <div class="prof2-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div class="prof2-card-label">Library</div>
          <span style="font-size:12px;color:var(--text-muted)">${shows.length} shows</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          ${['all','watching','uptodate','completed','watchlist','watchlater','stopped'].map(f => `
            <button class="filter-btn${currentFilter === f ? ' active' : ''}"
              style="font-size:11px;padding:4px 10px"
              onclick="setUserProfileFilter('${uid}','${f}')">
              ${filterLabels[f]}
              <span class="filter-count">${filterCounts[f]}</span>
            </button>`).join('')}
        </div>
        <div id="up-shows-grid-${uid}">
          ${renderShowGrid(currentFilter)}
        </div>
      </div>
    </div>
  </div>`;

  // Async load follower/following counts for this user profile
  Promise.all([
    loadFollowerCount(uid),
    loadFollowingCount(uid),
  ]).then(([followers, followingCount]) => {
    const fn = document.getElementById(`prof2-follower-num-${uid}`);
    const ff = document.getElementById(`prof2-following-num-${uid}`);
    if (fn) fn.textContent = followers;
    if (ff) ff.textContent = followingCount;
  });
}

function setUserProfileFilter(uid, f) {
  if (!window._upFilter) window._upFilter = {};
  window._upFilter[uid] = f;
  const profile = window._upCache?.[uid];
  const shows   = profile?.shows || [];

  const isUpToDate = s => s.status === 'completed' && s.show_status !== 'Ended' && s.show_status !== 'Canceled';
  const isFinished = s => s.status === 'completed' && (s.show_status === 'Ended' || s.show_status === 'Canceled');

  const filtered = f === 'all' ? shows
    : f === 'uptodate'  ? shows.filter(isUpToDate)
    : f === 'completed' ? shows.filter(isFinished)
    : shows.filter(s => s.status === f);

  const grid = document.getElementById(`up-shows-grid-${uid}`);
  if (!grid) return;

  document.querySelectorAll(`.filter-btn[onclick*="'${uid}'"]`).forEach(btn => {
    const m = btn.getAttribute('onclick').match(/'([^']+)'\)$/);
    btn.classList.toggle('active', m && m[1] === f);
  });

  const showMiniLocal = s => {
    const img  = s.poster_path ? IMG_SM + s.poster_path : FALLBACK_IMG;
    const disp = isUpToDate(s) ? 'uptodate' : s.status;
    const badgeColor = { watching:'#f4a534', uptodate:'#4caf87', completed:'#7c6aff', watchlist:'#4ecdc4', watchlater:'#4ecdc4', stopped:'#ff6b6b' }[disp] || '#888';
    const badgeLabel = { watching:'Watching', uptodate:'Up to Date', completed:'Finished', watchlist:'Watchlist', watchlater:'Watch Later', stopped:'Stopped' }[disp] || '';
    return `<div class="up-show-card" onclick="openShow(${s.id})" style="cursor:pointer">
      <div style="position:relative">
        <img src="${img}" onerror="this.src='${FALLBACK_IMG}'" loading="lazy" decoding="async" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:8px;display:block;border:1px solid var(--border)">
        ${badgeLabel ? `<div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font-size:9px;font-weight:700;color:${badgeColor};text-shadow:0 1px 3px rgba(0,0,0,0.8)">${badgeLabel}</div>` : ''}
      </div>
      <div class="up-show-name">${escHtml(s.name)}</div>
    </div>`;
  };

  if (!filtered.length) {
    grid.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:16px 0">No shows here yet</div>`;
  } else {
    grid.innerHTML = `<div class="up-shows-grid" style="grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:10px">${filtered.map(showMiniLocal).join('')}</div>`;
  }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function renderSettings() {
  const c          = document.getElementById('content');
  const uname      = currentUsername || '';
  const email      = currentUser?.email || '';
  const profilePic = state.profilePic || null;
  const initial    = (uname || email || 'U')[0].toUpperCase();
  const joinDate   = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';

  c.innerHTML = `
  <input type="file" id="settings-pic-input" accept="image/*" style="display:none" onchange="handlePicUpload(event);renderSettings()">
  <input type="file" id="settings-tvtime-input" accept=".csv" style="display:none" onchange="handleTVTimeImport(event)">

  <div class="st-wrap">

    <!-- ── PROFILE CARD ── -->
    <div class="st-profile-card">
      <div class="st-profile-avatar" onclick="document.getElementById('settings-pic-input').click()">
        ${profilePic
          ? `<img src="${profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`
          : `<span style="font-family:'Bebas Neue';font-size:28px;color:var(--accent)">${initial}</span>`}
        <div class="st-profile-edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"/></svg>
        </div>
      </div>
      <div class="st-profile-info">
        <div class="st-profile-name">${uname ? escHtml(uname) : '<span style="color:var(--text-muted);font-size:14px">No username set</span>'}</div>
        <div class="st-profile-email">${escHtml(email)}</div>
        ${joinDate ? `<div class="st-profile-since">Member since ${joinDate}</div>` : ''}
      </div>
      <div class="st-profile-actions">
        <button class="btn" onclick="document.getElementById('settings-pic-input').click()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Change Photo
        </button>
        ${profilePic ? `<button class="btn danger" onclick="removeProfilePic()">Remove</button>` : ''}
      </div>
    </div>

    <!-- ── ACCOUNT ── -->
    <div class="st-section">
      <div class="st-section-hdr">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Account
      </div>

      <div class="st-row">
        <div class="st-row-ic" style="background:rgba(124,106,255,0.12);color:#7c6aff">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="st-row-info">
          <div class="st-row-title">Username</div>
          <div class="st-row-val">${uname ? `@${escHtml(uname)}` : '<span style="color:var(--text-muted)">Not set</span>'}</div>
        </div>
        <button class="st-row-btn" onclick="showChangeUsernameModal()">Change</button>
      </div>

      <div class="st-row">
        <div class="st-row-ic" style="background:rgba(78,205,196,0.12);color:#4ecdc4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <div class="st-row-info">
          <div class="st-row-title">Email Address</div>
          <div class="st-row-val">${escHtml(email)}</div>
        </div>
        <button class="st-row-btn" onclick="showChangeEmailModal()">Change</button>
      </div>

      <div class="st-row st-row-last">
        <div class="st-row-ic" style="background:rgba(244,165,52,0.12);color:#f4a534">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>
        <div class="st-row-info">
          <div class="st-row-title">Password</div>
          <div class="st-row-val" style="letter-spacing:3px;color:var(--text-muted)">••••••••</div>
        </div>
        <button class="st-row-btn" onclick="showChangePasswordModal()">Change</button>
      </div>
    </div>

    <!-- ── LIBRARY ── -->
    <div class="st-section">
      <div class="st-section-hdr">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        Library
      </div>

      <div class="st-row">
        <div class="st-row-ic" style="background:rgba(76,175,135,0.12);color:#4caf87">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="st-row-info">
          <div class="st-row-title">Import from TV Time</div>
          <div class="st-row-desc">Upload a TV Time CSV export to import your watch history</div>
        </div>
        <button class="st-row-btn" onclick="document.getElementById('settings-tvtime-input').click()">Import CSV</button>
      </div>

      <div class="st-row st-row-last">
        <div class="st-row-ic" style="background:rgba(255,91,91,0.1);color:#ff5b5b">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </div>
        <div class="st-row-info">
          <div class="st-row-title">Clear Library</div>
          <div class="st-row-desc">Delete all shows, history, and custom lists</div>
        </div>
        <button class="st-row-btn st-row-btn-danger" onclick="confirmClearLibrary()">Clear</button>
      </div>
    </div>

    <!-- ── DANGER ZONE ── -->
    <div class="st-section st-danger">
      <div class="st-section-hdr" style="color:#ff5b5b">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Danger Zone
      </div>
      <div class="st-row st-row-last">
        <div class="st-row-ic" style="background:rgba(255,91,91,0.12);color:#ff5b5b">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <div class="st-row-info">
          <div class="st-row-title">Delete Account</div>
          <div class="st-row-desc">Permanently delete your account and all data. This cannot be undone.</div>
        </div>
        <button class="st-row-btn st-row-btn-danger" onclick="showDeleteAccountModal()">Delete</button>
      </div>
    </div>

  </div>`;
}

// ─── ALL TAB LIBRARY SEARCH ───────────────────────────────────────────────────
function setAllSearchMode(mode) {
  if (!window._allSearch) window._allSearch = { q: '', mode: 'name' };
  window._allSearch.mode = mode;
  window._showPage = 40;
  renderShelfView('completed', 'All');
}

function setAllSearchQuery(q) {
  if (!window._allSearch) window._allSearch = { q: '', mode: 'name' };
  window._allSearch.q = q;
  window._showPage = 40;
  renderShelfView('completed', 'All');
}

function clearAllSearch() {
  if (!window._allSearch) window._allSearch = { q: '', mode: 'name' };
  window._allSearch.q = '';
  window._showPage = 40;
  renderShelfView('completed', 'All');
}

// ─── UPCOMING EPISODES ────────────────────────────────────────────────────────
function renderUpcoming() {
  const c = document.getElementById('content');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Gather all future episodes from entire library
  const upcoming = [];
  Object.entries(state.shows).forEach(([showId, d]) => {
    if (d.status === 'stopped' || d.status === 'watchlater') return;
    const seasonsData = state.seasons[showId];
    if (!seasonsData || !Object.keys(seasonsData).length) return;
    const show = d.show;
    if (!show) return;
    Object.entries(seasonsData).forEach(([snum, sData]) => {
      const eps = sData.episodes || [];
      eps.forEach(ep => {
        if (!ep.air_date) return;
        const airDate = new Date(ep.air_date);
        airDate.setHours(0, 0, 0, 0);
        if (airDate >= today) {
          const isPremiere = ep.episode_number === 1;
          const isFinale = ep.episode_number === eps[eps.length - 1]?.episode_number && eps.length > 1;
          upcoming.push({ showId, show, snum, ep, airDate, dateStr: ep.air_date, status: d.status, isPremiere, isFinale });
        }
      });
    });
  });
  upcoming.sort((a, b) => a.airDate - b.airDate);

  if (!upcoming.length) {
    c.innerHTML = `<div class="section-header" style="margin-bottom:20px">
      <div class="section-title">Upcoming Episodes</div>
    </div>
    <div class="empty-state">
      <div class="big" style="font-size:40px">📅</div>
      <h3>No Upcoming Episodes</h3>
      <p>Add shows to your library to see when their episodes air</p>
    </div>`;
    return;
  }

  // Calendar state
  if (!window._upcomingCal) {
    window._upcomingCal = { year: today.getFullYear(), month: today.getMonth(), selected: null };
  }
  const { year: calYear, month: calMonth, selected: selectedDate } = window._upcomingCal;

  // Count episodes per day in this calendar month
  const epDays = {};
  upcoming.forEach(item => {
    if (item.airDate.getFullYear() === calYear && item.airDate.getMonth() === calMonth) {
      const d = item.airDate.getDate();
      epDays[d] = (epDays[d] || 0) + 1;
    }
  });

  // Build calendar HTML
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  let calCells = '';
  for (let i = 0; i < firstDay; i++) calCells += `<div class="uc-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isPast = new Date(calYear, calMonth, d) < today && !isToday;
    const hasEps = !!epDays[d];
    const isSelected = selectedDate === dateStr;
    calCells += `<div class="uc-day${isToday ? ' today' : ''}${isPast ? ' past' : ''}${hasEps ? ' has-ep' : ''}${isSelected ? ' selected' : ''}"
      onclick="${hasEps || isToday ? `selectUpcomingDate('${dateStr}')` : ''}">
      <span class="uc-day-num">${d}</span>
      ${hasEps ? `<span class="uc-dot">${epDays[d] > 1 ? epDays[d] : ''}</span>` : ''}
    </div>`;
  }

  // Filter upcoming by selected date or show all (capped at next 90 days by default)
  const showAll = !!window._upcomingCal?.showAll;
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 90);
  const listItems = selectedDate
    ? upcoming.filter(item => item.dateStr === selectedDate)
    : (showAll ? upcoming : upcoming.filter(item => item.airDate <= cutoff));
  const hiddenCount = (selectedDate || showAll) ? 0 : upcoming.filter(item => item.airDate > cutoff).length;

  // Group by date string
  const groups = {};
  listItems.forEach(item => {
    if (!groups[item.dateStr]) groups[item.dateStr] = [];
    groups[item.dateStr].push(item);
  });

  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  function relativeDate(dateStr) {
    if (dateStr === todayStr)    return 'Today';
    if (dateStr === tomorrowStr) return 'Tomorrow';
    const d = new Date(dateStr + 'T12:00:00');
    const diff = Math.round((d - today) / 864e5);
    if (diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }

  const statusDot = { watching:'#f4a534', completed:'#4caf87', watchlist:'#4ecdc4', watchlater:'#4ecdc4', stopped:'#888', uptodate:'#4caf87' };

  let listHtml = '';
  Object.entries(groups).forEach(([dateStr, items]) => {
    const isToday = dateStr === todayStr;
    const isTomorrow = dateStr === tomorrowStr;
    listHtml += `<div class="upcoming-group" id="upday-${dateStr}">
      <div class="upcoming-date-label">
        <span class="upd-reldate${isToday ? ' today' : isTomorrow ? ' tomorrow' : ''}">${relativeDate(dateStr)}</span>
        <span class="upd-count">${items.length} ep${items.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="upcoming-eps">`;
    items.forEach(({ show, snum, ep, status, isPremiere, isFinale }) => {
      const thumb = show.poster_path ? `https://image.tmdb.org/t/p/w92${show.poster_path}` : FALLBACK_IMG;
      const epCode = `S${String(snum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
      const dot = statusDot[status] || '#888';
      const tagHtml = isPremiere
        ? `<span class="ue-tag premiere">Premiere</span>`
        : isFinale ? `<span class="ue-tag finale">Finale</span>` : '';
      const networkName = (show.networks || [])[0]?.name || '';
      listHtml += `<div class="upcoming-ep-row" onclick="openShow(${show.id})">
        <img class="ue-poster" src="${thumb}" onerror="this.src='${FALLBACK_IMG}'" loading="lazy" decoding="async">
        <div class="ue-info">
          <div class="ue-show">
            <span class="ue-status-dot" style="background:${dot}"></span>${escHtml(show.name)}
          </div>
          <div class="ue-ep">
            <span class="ue-code">${epCode}</span>
            ${ep.name ? `<span class="ue-title">· ${escHtml(ep.name)}</span>` : ''}
            ${tagHtml}
          </div>
        </div>
        ${networkName ? `<div class="ue-network">${escHtml(networkName)}</div>` : ''}
      </div>`;
    });
    listHtml += `</div></div>`;
  });

  if (!listItems.length) {
    listHtml = `<div class="upcoming-empty">No episodes on this date</div>`;
  }

  const clearBtn = selectedDate
    ? `<button class="btn" onclick="selectUpcomingDate(null)" style="font-size:12px;padding:5px 12px">Show All</button>`
    : '';
  const showMoreBtn = hiddenCount > 0
    ? `<div style="text-align:center;margin-top:20px">
        <button class="btn" onclick="window._upcomingCal.showAll=true;renderUpcoming()" style="padding:10px 32px">
          Show ${hiddenCount} more episode${hiddenCount !== 1 ? 's' : ''} beyond 90 days
        </button>
       </div>`
    : '';

  c.innerHTML = `
    <div class="section-header" style="margin-bottom:20px">
      <div class="section-title">Upcoming Episodes</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="section-count">${upcoming.length} upcoming</span>
        ${clearBtn}
      </div>
    </div>
    <div class="upcoming-layout">
      <div class="uc-wrap">
        <div class="uc-header">
          <button class="uc-nav-btn" onclick="upcomingNavMonth(-1)">&#8249;</button>
          <span class="uc-month-label">${monthName}</span>
          <button class="uc-nav-btn" onclick="upcomingNavMonth(1)">&#8250;</button>
        </div>
        <div class="uc-day-hdrs">
          ${['S','M','T','W','T','F','S'].map(d => `<div class="uc-day-hdr">${d}</div>`).join('')}
        </div>
        <div class="uc-grid">${calCells}</div>
        <div class="uc-legend">
          <span class="uc-legend-dot"></span><span>Episode airs</span>
        </div>
      </div>
      <div class="upcoming-right">
        <div class="upcoming-list">${listHtml}</div>
        ${hiddenCount > 0 && !selectedDate && !window._upcomingCal?.showAll ? showMoreBtn : ''}
      </div>
    </div>`;
}

function upcomingNavMonth(dir) {
  if (!window._upcomingCal) window._upcomingCal = { year: new Date().getFullYear(), month: new Date().getMonth(), selected: null };
  window._upcomingCal.month += dir;
  if (window._upcomingCal.month > 11) { window._upcomingCal.month = 0; window._upcomingCal.year++; }
  if (window._upcomingCal.month < 0)  { window._upcomingCal.month = 11; window._upcomingCal.year--; }
  window._upcomingCal.selected = null;
  renderUpcoming();
}

function selectUpcomingDate(dateStr) {
  if (!window._upcomingCal) window._upcomingCal = { year: new Date().getFullYear(), month: new Date().getMonth(), selected: null };
  window._upcomingCal.selected = (dateStr === window._upcomingCal.selected) ? null : dateStr;
  renderUpcoming();
  if (window._upcomingCal.selected) {
    setTimeout(() => {
      const el = document.getElementById(`upday-${window._upcomingCal.selected}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}
