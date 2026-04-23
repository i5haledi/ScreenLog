// ─── FIRESTORE SYNC ───────────────────────────────────────────────────────────
// Saves to localStorage instantly (fast UI) + Firestore (cross-device sync)

let _syncTimer = null;

// Load user data from Firestore on login
async function syncLoad() {
  if (!currentUser) return;
  try {
    const uid  = currentUser.uid;
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const data = snap.data();
      if (data.shows)       state.shows       = data.shows;
      if (data.customLists) state.customLists  = data.customLists;
      if (data.activityLog) state.activityLog  = data.activityLog;
    }
    // Load seasons subcollection
    const seasonsSnap = await db.collection('users').doc(uid).collection('seasons').get();
    seasonsSnap.forEach(doc => { state.seasons[doc.id] = doc.data(); });
    // Mirror to localStorage as cache
    _localSave();
  } catch(e) {
    console.warn('Firestore load failed, using local cache:', e);
    _localLoad();
  }
}

// Push state to Firestore (debounced 2s to avoid excessive writes)
function syncSave() {
  _localSave();
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(_firestoreSave, 2000);
}

async function _firestoreSave() {
  if (!currentUser) return;
  try {
    const uid = currentUser.uid;
    await db.collection('users').doc(uid).set({
      shows:       state.shows,
      customLists: state.customLists,
      activityLog: (state.activityLog || []).slice(0, 100),
    }, { merge: true });
  } catch(e) {
    console.warn('Firestore save failed:', e);
  }
}

// Save a single show's seasons to its own subcollection document
async function syncSaveSeasons(showId) {
  if (!currentUser || !state.seasons[showId]) return;
  try {
    const uid = currentUser.uid;
    await db.collection('users').doc(uid).collection('seasons').doc(String(showId)).set(state.seasons[showId]);
  } catch(e) {
    console.warn('Seasons save failed:', e);
  }
}

// ─── LOCAL CACHE ──────────────────────────────────────────────────────────────
function _localSave() {
  try {
    const { seasons, ...rest } = state;
    localStorage.setItem('sl_state',   JSON.stringify(rest));
    localStorage.setItem('sl_seasons', JSON.stringify(seasons));
  } catch(e) {}
}

function _localLoad() {
  try {
    const d = localStorage.getItem('sl_state');
    if (d) Object.assign(state, JSON.parse(d));
    const s = localStorage.getItem('sl_seasons');
    if (s) state.seasons = JSON.parse(s);
  } catch(e) {}
}

// Override state.js save() and load() to use sync versions
function save() { syncSave(); }
function load() { _localLoad(); }
