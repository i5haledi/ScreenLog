// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view));
  const titles = {
    home: 'Main', watching: 'Watching', watchlist: 'Watchlist',
    completed: 'All', uptodate: 'Up to Date', finished: 'Finished',
    activity: 'Activity', profile: 'My Profile'
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
  } else if (status === 'watching') {
    logActivity('add', id, show.name, show.poster_path, '');
  } else if (status === 'watchlist') {
    logActivity('wl', id, show.name, show.poster_path, '');
  }

  save();
  renderModalActions(id);
  renderEpisodesTab(document.getElementById('m-tab-content'));
  render();
}

function removeShow(id) {
  delete state.shows[id];
  state.customLists.forEach(l => { if (l.showIds) l.showIds = l.showIds.filter(s => s !== String(id)); });
  save(); closeModal(); render();
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
  renderEpisodesTab(document.getElementById('m-tab-content'));
  renderModalActions(showId);
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
  save(); render();
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

// ─── PROFILE PIC ──────────────────────────────────────────────────────────────
function handlePicUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast('Image must be under 3MB'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    // Resize to max 300x300 before saving
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
      // Save to Firestore
      if (currentUser) {
        try {
          await db.collection('users').doc(currentUser.uid).set({ profilePic: base64 }, { merge: true });
        } catch(e) {}
      }
      renderProfile();
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
