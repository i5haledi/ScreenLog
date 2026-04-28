// ─── STATE ──────────────────────────────────────────────────────────────────
let state = {
  view: 'home',
  shows: {},
  watchlist: [],
  customLists: [],
  seasons: {},
  activityLog: [],
  favorites: [],
};

// ─── PERSIST ────────────────────────────────────────────────────────────────
function save() {
  try {
    const { seasons, ...rest } = state;
    localStorage.setItem('sl_state', JSON.stringify(rest));
    localStorage.setItem('sl_seasons', JSON.stringify(seasons));
  } catch(e) {}
}

function load() {
  try {
    const d = localStorage.getItem('sl_state');
    if (d) Object.assign(state, JSON.parse(d));
    const s = localStorage.getItem('sl_seasons');
    if (s) state.seasons = JSON.parse(s);
  } catch(e) {}
}

// ─── ACTIVITY LOG ───────────────────────────────────────────────────────────
function logActivity(type, showId, showName, posterId, detail) {
  if (!state.activityLog) state.activityLog = [];
  state.activityLog.unshift({
    id: Date.now() + Math.random(),
    type, ts: Date.now(),
    showId, showName,
    posterId: posterId || null,
    detail: detail || ''
  });
  if (state.activityLog.length > 300) state.activityLog = state.activityLog.slice(0, 300);
  save();
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function getShows(status) {
  return Object.entries(state.shows)
    .filter(([, d]) => d.status === status)
    .map(([id, d]) => ({ id, ...d }));
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function countTotalEps(d) {
  const show = d.show;
  if (!show) return 0;
  const seasonsData = state.seasons[show.id];
  if (seasonsData && Object.keys(seasonsData).length) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    let count = 0;
    Object.values(seasonsData).forEach(sData => {
      (sData.episodes || []).forEach(ep => {
        if (ep.air_date && new Date(ep.air_date) <= today) count++;
      });
    });
    if (count > 0) return count;
  }
  return show.number_of_episodes || 0;
}

// FIX: Only return the next AIRED unwatched episode (skip future/unaired)
function findNextEpisode(d) {
  const id = d.show?.id;
  if (!id || !state.seasons[id]) return null;
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sNums = Object.keys(state.seasons[id]).sort((a, b) => +a - +b);
  for (const sn of sNums) {
    const eps = state.seasons[id][sn]?.episodes || [];
    for (let i = 0; i < eps.length; i++) {
      const ep = eps[i];
      const key = `${sn}_${ep.episode_number}`;
      if (!d.watched?.[key]) {
        const airDate = ep.air_date ? new Date(ep.air_date) : null;
        // Skip episodes that haven't aired yet
        if (!airDate || airDate > today) continue;
        const label = `S${sn}E${ep.episode_number}`;
        const isPremiere = ep.episode_number === 1;
        const isFinale = i === eps.length - 1;
        const isNew = airDate >= weekAgo;
        let tag = null, tagColor = null;
        if (isPremiere)     { tag = 'Premiere';    tagColor = '#7c6aff'; }
        else if (isFinale)  { tag = 'Finale';      tagColor = '#ff6b6b'; }
        else if (isNew)     { tag = 'New Episode'; tagColor = '#4ecdc4'; }
        return { label, tag, tagColor };
      }
    }
  }
  return null;
}

function checkUpToDate(showId) {
  const d = state.shows[showId];
  if (!d || d.status !== 'watching') return;
  const show = d.show;
  if (!show || show.status === 'Ended' || show.status === 'Canceled') return;
  const seasonsData = state.seasons[showId];
  if (!seasonsData || !Object.keys(seasonsData).length) return;
  const today = new Date(); today.setHours(23, 59, 59, 999);
  let airedTotal = 0, airedWatched = 0;
  Object.entries(seasonsData).forEach(([snum, sData]) => {
    (sData.episodes || []).forEach(ep => {
      if (!ep.air_date) return;
      if (new Date(ep.air_date) <= today) {
        airedTotal++;
        if (d.watched?.[`${snum}_${ep.episode_number}`]) airedWatched++;
      }
    });
  });
  if (airedTotal > 0 && airedWatched >= airedTotal) {
    state.shows[showId].status = 'completed';
    save();
    syncSaveShow(showId);
    render();
    showToast(`${show.name} moved to Up to Date`);
  }
}

function runUpToDateCheck() {
  Object.keys(state.shows).forEach(id => checkUpToDate(id));
}
