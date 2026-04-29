// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function navigate(view) {
  // Removed tabs redirect to the All view with the appropriate filter pre-set
  const filterRedirects = { stopped: 'stopped', watchlater: 'watchlater', uptodate: 'uptodate', finished: 'finished' };
  if (filterRedirects[view]) {
    completedFilter = filterRedirects[view];
    view = 'completed';
  }

  state.view = view;
  window._showPage = 40;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view));
  const titles = {
    home: 'Main', watching: 'Watching', watchlist: 'Watchlist',
    completed: 'All', activity: 'Activity', profile: 'My Profile', people: 'People',
    settings: 'Settings'
  };
  document.getElementById('view-title').textContent = titles[view] || view;
  closeSidebar();
  render();
}

function navigateToList(id) {
  const list = state.customLists.find(l => l.id === id);
  if (!list) return;
  state.view = 'list:' + id;
  document.getElementById('view-title').textContent = list.name;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  render();
}

// ─── SHOW ACTIONS ────────────────────────────────────────────────────────────
function setStatus(id, status) {
  const show = currentShow;
  if (!show) return;
  if (!state.shows[id]) state.shows[id] = { show, watched: {}, status };
  else { state.shows[id].status = status; state.shows[id].show = show; }

  if (status === 'completed') {
    if (!state.shows[id].watched) state.shows[id].watched = {};
    Object.entries(state.seasons[id] || {}).forEach(([snum, sData]) => {
      (sData.episodes || []).forEach(ep => {
        state.shows[id].watched[`${snum}_${ep.episode_number}`] = true;
      });
    });
    logActivity('done', id, show.name, show.poster_path, '');
  } else if (status === 'watchlist') {
    logActivity('wl', id, show.name, show.poster_path, '');
  }

  save();
  syncSaveShow(id); // FIX: sync the changed show
  renderModalActions(id);
  renderEpisodesTab(document.getElementById('m-tab-content'));
  render();
}

// FIX: removeShow now properly syncs deletion to Firestore
function removeShow(id) {
  delete state.shows[id];
  state.customLists.forEach(l => { if (l.showIds) l.showIds = l.showIds.filter(s => s !== String(id)); });
  save();
  syncSaveShow(id); // show is gone from state → _flushPendingShows will delete from Firestore
  closeModal();
  render();
}

// ─── EPISODE ACTIONS ─────────────────────────────────────────────────────────
function toggleEp(showId, key) {
  if (!state.shows[showId]) return;
  if (!state.shows[showId].watched) state.shows[showId].watched = {};
  const newVal = !state.shows[showId].watched[key];
  state.shows[showId].watched[key] = newVal;
  if (newVal) {
    const show = state.shows[showId].show;
    const [snum, epnum] = key.split('_');
    const epData  = state.seasons[showId]?.[snum]?.episodes?.find(e => e.episode_number == epnum);
    const epLabel = `S${snum}E${epnum}${epData?.name ? ' · ' + epData.name : ''}`;
    logActivity('ep', showId, show.name, show.poster_path, epLabel);
    checkUpToDate(showId);
  }
  save();
  syncSaveShow(showId); // FIX: sync the episode change
  renderEpisodesTab(document.getElementById('m-tab-content'));
  renderModalActions(showId);
}

function markSeasonWatched(showId, snum, markAll) {
  if (!state.shows[showId]) return;
  if (!state.shows[showId].watched) state.shows[showId].watched = {};
  (state.seasons[showId]?.[snum]?.episodes || []).forEach(ep => {
    state.shows[showId].watched[`${snum}_${ep.episode_number}`] = markAll;
  });
  if (markAll) checkUpToDate(showId);
  save();
  syncSaveShow(showId); // FIX: sync the bulk episode change
  renderEpisodesTab(document.getElementById('m-tab-content'));
  renderModalActions(showId);
}

// Mark all episodes as watched for a completed show (e.g. after import or first open)
function ensureAllEpsMarked(showId) {
  const d = state.shows[showId];
  if (!d || d.status !== 'completed') return;
  const seasonsData = state.seasons[showId];
  if (!seasonsData || !Object.keys(seasonsData).length) return;
  if (!d.watched) d.watched = {};
  let changed = false;
  Object.entries(seasonsData).forEach(([snum, sData]) => {
    (sData.episodes || []).forEach(ep => {
      const key = `${snum}_${ep.episode_number}`;
      if (!d.watched[key]) {
        d.watched[key] = true;
        changed = true;
      }
    });
  });
  if (changed) {
    save();
    syncSaveShow(showId);
  }
}

// ─── QUICK MARK (CONFIRM FLOW) ────────────────────────────────────────────────
function quickMarkEp(showId, key, label) {
  const show = state.shows[showId]?.show;
  if (!show) return;
  document.getElementById('confirm-show-name').textContent = show.name;
  document.getElementById('confirm-ep-label').textContent  = label;
  document.getElementById('confirm-modal').style.display   = 'flex';
  window._pendingMark = { showId, key, label };
}

function confirmMarkEp() {
  const { showId, key, label } = window._pendingMark || {};
  if (!showId || !key) return;
  if (!state.shows[showId].watched) state.shows[showId].watched = {};
  state.shows[showId].watched[key] = true;
  const show    = state.shows[showId].show;
  const [snum, epnum] = key.split('_');
  const epData  = state.seasons[showId]?.[snum]?.episodes?.find(e => e.episode_number == epnum);
  const epLabel = `S${snum}E${epnum}${epData?.name ? ' · ' + epData.name : ''}`;
  logActivity('ep', showId, show.name, show.poster_path, epLabel);
  checkUpToDate(showId);
  save();
  syncSaveShow(showId); // FIX: sync quick-mark change
  render();
  closeConfirmModal();
  showToast(`Marked ${label} as watched`);
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
  window._pendingMark = null;
}

// ─── MODAL CONTROLS ──────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('show-modal').style.display = 'none';
  currentShow = null;
  closeDropdown();
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('show-modal')) closeModal();
}

// ─── DROPDOWN ────────────────────────────────────────────────────────────────
let addToListDropdownTarget = null;

function toggleListDropdown(id) {
  closeDropdown();
  const el = document.getElementById(`list-dropdown-${id}`);
  if (el) { el.style.display = 'block'; addToListDropdownTarget = id; }
}

function closeDropdown() {
  if (addToListDropdownTarget !== null) {
    const el = document.getElementById(`list-dropdown-${addToListDropdownTarget}`);
    if (el) el.style.display = 'none';
    addToListDropdownTarget = null;
  }
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown') && !e.target.closest('.btn')) closeDropdown();
});

function toggleShowInList(listId, showId) {
  const list = state.customLists.find(l => l.id === listId);
  if (!list) return;
  if (!list.showIds) list.showIds = [];
  const sid = String(showId);
  const idx = list.showIds.indexOf(sid);
  if (idx >= 0) {
    list.showIds.splice(idx, 1);
  } else {
    list.showIds.push(sid);
    const show = state.shows[showId]?.show || currentShow;
    if (show) logActivity('list', showId, show.name, show.poster_path, list.name);
  }
  save(); renderModalActions(showId); renderSidebarLists();
  closeDropdown();
}

// ─── CUSTOM LISTS ────────────────────────────────────────────────────────────
let selectedColor = COLORS[0];

function openNewListModal() {
  selectedColor = COLORS[0];
  document.getElementById('new-list-name').value = '';
  document.getElementById('color-swatches').innerHTML = COLORS.map((c, i) =>
    `<div class="swatch${i === 0 ? ' selected' : ''}" style="background:${c}" onclick="selectColor('${c}',this)"></div>`
  ).join('');
  document.getElementById('list-modal').style.display = 'flex';
}

function selectColor(c, el) {
  selectedColor = c;
  document.querySelectorAll('#color-swatches .swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

function closeListModal() { document.getElementById('list-modal').style.display = 'none'; }
function handleListOverlayClick(e) { if (e.target === document.getElementById('list-modal')) closeListModal(); }

function createList() {
  const name = document.getElementById('new-list-name').value.trim();
  if (!name) return;
  state.customLists.push({ id: 'list_' + Date.now(), name, color: selectedColor, showIds: [] });
  save(); closeListModal(); renderSidebarLists();
}

function deleteList(id) {
  state.customLists = state.customLists.filter(l => l.id !== id);
  save(); navigate('home');
}

// ─── ACTIVITY HELPERS ─────────────────────────────────────────────────────────
function a_click(showId) { if (showId && state.shows[showId]) openShow(showId); }

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── SEARCH BLUR ─────────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('blur', () => {
  setTimeout(() => document.getElementById('search-results').style.display = 'none', 200);
});

// ─── MULTI-SELECT ─────────────────────────────────────────────────────────────
function toggleSelectMode() {
  window._selectMode    = !window._selectMode;
  window._selectedShows = new Set();
  render();
}

function toggleSelectShow(id) {
  if (!window._selectedShows) window._selectedShows = new Set();
  const sid = String(id);
  if (window._selectedShows.has(sid)) window._selectedShows.delete(sid);
  else window._selectedShows.add(sid);
  render();
}

function deleteSelectedShows() {
  const ids = [...(window._selectedShows || [])];
  if (!ids.length) return;
  ids.forEach(id => {
    delete state.shows[id];
    state.customLists.forEach(l => { if (l.showIds) l.showIds = l.showIds.filter(s => s !== id); });
    syncSaveShow(id); // FIX: queues deletion from Firestore for each removed show
  });
  window._selectMode    = false;
  window._selectedShows = new Set();
  save();
  render();
  showToast(`Deleted ${ids.length} show${ids.length > 1 ? 's' : ''}`);
}

function moveSelectedShows(newStatus) {
  const ids = [...(window._selectedShows || [])];
  if (!ids.length) return;
  const labels = { watching:'Watching', completed:'Completed', watchlist:'Watchlist', stopped:'Stopped', watchlater:'Watch Later' };
  ids.forEach(id => {
    if (state.shows[id]) {
      state.shows[id].status = newStatus;
      syncSaveShow(id);
    }
  });
  window._selectMode    = false;
  window._selectedShows = new Set();
  save();
  render();
  showToast(`Moved ${ids.length} show${ids.length > 1 ? 's' : ''} to ${labels[newStatus] || newStatus}`);
}

// ─── CLEAR LIBRARY ────────────────────────────────────────────────────────────
function confirmClearLibrary() {
  const el = document.createElement('div');
  el.id = 'clear-modal';
  el.className = 'modal-overlay';
  el.style.cssText = 'display:flex;z-index:2000';
  el.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header" style="border-bottom:none;padding-bottom:0">
        <div class="modal-info">
          <div class="modal-title" style="font-size:20px;color:var(--red)">Clear Library?</div>
        </div>
        <button class="modal-close" onclick="document.getElementById('clear-modal').remove()">×</button>
      </div>
      <div class="modal-body" style="padding-top:10px">
        <p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">
          This will permanently delete <strong>all ${Object.keys(state.shows).length} shows</strong> from your library including watch history, custom lists, and activity log. This cannot be undone.
        </p>
        <div style="display:flex;gap:10px">
          <button class="btn" onclick="document.getElementById('clear-modal').remove()" style="flex:1">Cancel</button>
          <button class="btn danger" onclick="executeClearLibrary()" style="flex:1;background:rgba(255,91,91,0.12)">Yes, Clear Everything</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function executeClearLibrary() {
  document.getElementById('clear-modal')?.remove();
  state.shows       = {};
  state.seasons     = {};
  state.activityLog = [];
  state.customLists = [];
  state.favorites   = [];
  _localSave();
  if (currentUser) {
    try {
      const uid = currentUser.uid;
      // Clear main doc
      await db.collection('users').doc(uid).set({
        customLists: [], activityLog: [], favorites: [], profilePic: state.profilePic || null
      }, { merge: true });
      // FIX: use chunked batch deletes (handles >500 docs safely)
      const showsSnap = await db.collection('users').doc(uid).collection('shows').get();
      await _batchDeleteSnap(showsSnap);
      const seasonsSnap = await db.collection('users').doc(uid).collection('seasons').get();
      await _batchDeleteSnap(seasonsSnap);
    } catch(e) { console.warn('Clear failed:', e); }
  }
  render();
  showToast('Library cleared');
}

// ─── TV TIME IMPORT ───────────────────────────────────────────────────────────

// FIX: Proper CSV parser that handles quoted fields with commas
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

async function handleTVTimeImport(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const text = await file.text();
  const lines = text.trim().split('\n').slice(1); // skip header

  // Status map: tvtime → screenlog
  const statusMap = {
    'up_to_date':     'completed',
    'continuing':     'watching',
    'stopped':        'stopped',
    'watch_later':    'watchlater',
    'not_started_yet':'watchlist',
  };

  // FIX: Use proper CSV parser for quoted fields
  const rows = [];
  for (const line of lines) {
    const parts = parseCSVLine(line);
    if (parts.length < 6) continue;
    const tvdb_id = parts[1]?.trim();
    const title   = parts[3]?.trim();
    const status  = parts[4]?.trim();
    const mapped  = statusMap[status];
    if (!tvdb_id || !mapped || !title) continue;
    rows.push({ tvdb_id, title, status: mapped });
  }

  if (!rows.length) { showToast('No valid shows found in CSV'); return; }

  showImportModal(rows.length);
  let imported = 0, failed = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    updateImportProgress(i + 1, rows.length, row.title);

    const alreadyIn = Object.values(state.shows).find(d => d.show?.name?.toLowerCase() === row.title.toLowerCase());
    if (alreadyIn) { skipped++; continue; }

    try {
      let show = null;
      const r    = await tmdbFetch(`${TMDB}/find/${row.tvdb_id}?external_source=tvdb_id`);
      const data = await r.json();
      const hit  = (data.tv_results || [])[0];

      if (hit) {
        const r2   = await tmdbFetch(`${TMDB}/tv/${hit.id}`);
        const full = await r2.json();
        show = full.id ? full : hit;
      } else {
        const r3  = await tmdbFetch(`${TMDB}/search/tv?query=${encodeURIComponent(row.title)}&page=1`);
        const d3  = await r3.json();
        const res = (d3.results || [])[0];
        if (res) {
          const r4   = await tmdbFetch(`${TMDB}/tv/${res.id}`);
          const full = await r4.json();
          show = full.id ? full : res;
        }
      }

      if (show) {
        state.shows[show.id] = { show, status: row.status, watched: {} };
        imported++;
      } else {
        failed++;
      }
    } catch(e) { failed++; }

    if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 250));
  }

  _localSave();
  updateImportProgress(rows.length, rows.length, 'Saving to cloud...');
  await syncSaveAllShows();
  await _firestoreSaveMain();
  closeImportModal();
  runUpToDateCheck();
  render();
  showToast(`Imported ${imported} shows · ${skipped} skipped · ${failed} not found`);
}

function showImportModal(total) {
  const existing = document.getElementById('import-modal');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'import-modal';
  el.className = 'modal-overlay';
  el.style.cssText = 'display:flex;z-index:2000';
  el.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header" style="border-bottom:none;padding-bottom:8px">
        <div class="modal-info">
          <div class="modal-title" style="font-size:20px">Importing TV Time</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Fetching full show details — please wait, do not close this tab</div>
        </div>
      </div>
      <div class="modal-body" style="padding-top:8px">
        <div id="import-show-name" style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;min-height:20px"></div>
        <div style="background:var(--bg-elevated);border-radius:8px;overflow:hidden;height:8px;margin-bottom:12px">
          <div id="import-bar" style="height:100%;background:var(--accent);border-radius:8px;width:0%;transition:width 0.3s"></div>
        </div>
        <div id="import-count" style="font-size:12px;color:var(--text-muted);text-align:center">0 / ${total}</div>
      </div>
    </div>`;
  document.body.appendChild(el);
}

function updateImportProgress(current, total, title) {
  const pct  = Math.round(current / total * 100);
  const bar  = document.getElementById('import-bar');
  const cnt  = document.getElementById('import-count');
  const name = document.getElementById('import-show-name');
  if (bar)  bar.style.width  = pct + '%';
  if (cnt)  cnt.textContent  = `${current} / ${total}`;
  if (name) name.textContent = title;
}

function closeImportModal() {
  const el = document.getElementById('import-modal');
  if (el) el.remove();
}

// ─── PROFILE PIC ──────────────────────────────────────────────────────────────
function handlePicUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast('Image must be under 3MB'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const size   = 300;
      canvas.width = canvas.height = size;
      const ctx    = canvas.getContext('2d');
      const scale  = Math.max(size/img.width, size/img.height);
      const w      = img.width  * scale;
      const h      = img.height * scale;
      ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      state.profilePic = base64;
      save();
      if (currentUser) {
        try {
          await db.collection('users').doc(currentUser.uid).set({ profilePic: base64 }, { merge: true });
        } catch(e) {}
      }
      // FIX: safe fallback if both username and email are null
      const label = currentUsername || currentUser?.email || 'U';
      setUserDisplay(label[0].toUpperCase(), label);
      if (state.view === 'settings') renderSettings();
      else renderProfile();
      showToast('Profile photo updated');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─── FAVORITES ────────────────────────────────────────────────────────────────
function openFavoritePicker(slot) {
  window._favSlot = slot;
  document.getElementById('fav-picker-modal').style.display = 'flex';
}

function closeFavoritePicker() {
  document.getElementById('fav-picker-modal').style.display = 'none';
  window._favSlot = null;
}

function setFavorite(slot, showId) {
  if (slot === null || slot === undefined) return;
  if (!state.favorites) state.favorites = [];
  if ((state.favorites).includes(String(showId))) { closeFavoritePicker(); return; }
  state.favorites[slot] = String(showId);
  save();
  closeFavoritePicker();
  renderProfile();
}

function removeFavorite(slot) {
  if (!state.favorites) return;
  state.favorites[slot] = null;
  save();
  renderProfile();
}

// ─── PEOPLE / SOCIAL ─────────────────────────────────────────────────────────
function viewUser(uid) {
  state.view = 'user:' + uid;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.nav-item[data-view="people"]')?.classList.add('active');
  const cached = window._upCache?.[uid];
  document.getElementById('view-title').textContent = cached?.username ? '@' + cached.username : 'Profile';
  closeSidebar();
  render();
}

let _peopleSearchTimer = null;
function onPeopleSearch(query) {
  clearTimeout(_peopleSearchTimer);
  const resultsEl  = document.getElementById('people-results');
  const discoverEl = document.getElementById('people-discover');
  if (!resultsEl) return;

  if (!query || query.length < 2) {
    resultsEl.innerHTML = '';
    if (discoverEl) discoverEl.style.display = '';
    return;
  }

  if (discoverEl) discoverEl.style.display = 'none';
  resultsEl.innerHTML = `<div style="text-align:center;padding:20px"><div class="spinner"></div></div>`;

  _peopleSearchTimer = setTimeout(async () => {
    const results = await searchUsers(query);
    const el2 = document.getElementById('people-results');
    if (!el2) return;
    if (!results.length) {
      el2.innerHTML = `<div style="color:var(--text-muted);font-size:14px;padding:16px 0">No users found for "<strong>${escHtml(query)}</strong>"</div>`;
      return;
    }
    el2.innerHTML = `<div class="people-grid">${results.map(r => renderUserCard(r)).join('')}</div>`;
  }, 400);
}

// ─── MOBILE SIDEBAR ───────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  if (isOpen) { closeSidebar(); } else {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ─── PROFILE BANNER COLOR ─────────────────────────────────────────────────────
function setBannerColor(color) {
  state.profileBannerColor = color;
  const hero = document.querySelector('.pp-hero');
  if (hero) hero.style.background = color;
  save();
}
