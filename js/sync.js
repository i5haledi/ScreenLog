// ─── FIRESTORE SYNC ───────────────────────────────────────────────────────────
// Architecture:
//   users/{uid}              → username, profilePic, favorites, customLists, activityLog
//   users/{uid}/shows/{id}   → individual show data (avoids 1MB doc limit)
//   users/{uid}/seasons/{id} → season/episode data

let _syncTimer    = null;
let _showsTimer   = null;
let _pendingShows = new Set(); // show IDs queued for save

// ─── LOAD ─────────────────────────────────────────────────────────────────────
async function syncLoad() {
  if (!currentUser) return;
  try {
    const uid  = currentUser.uid;

    // Load main user doc
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const data = snap.data();
      if (data.customLists) state.customLists = data.customLists;
      if (data.activityLog) state.activityLog = data.activityLog;
      if (data.favorites)   state.favorites   = data.favorites;
      if (data.profilePic)  state.profilePic  = data.profilePic;
      if (data.username)    currentUsername   = data.username;
    }

    // Load shows subcollection
    const showsSnap = await db.collection('users').doc(uid).collection('shows').get();
    showsSnap.forEach(doc => { state.shows[doc.id] = doc.data(); });

    // Load seasons subcollection
    const seasonsSnap = await db.collection('users').doc(uid).collection('seasons').get();
    seasonsSnap.forEach(doc => { state.seasons[doc.id] = doc.data(); });

    _localSave();
  } catch(e) {
    console.warn('Firestore load failed, using local cache:', e);
    _localLoad();
  }
}

// ─── SAVE (debounced) ─────────────────────────────────────────────────────────
function syncSave() {
  _localSave();
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(_firestoreSaveMain, 2000);
}

// Save user-level fields (not shows)
async function _firestoreSaveMain() {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      customLists: state.customLists || [],
      activityLog: (state.activityLog || []).slice(0, 100),
      favorites:   state.favorites   || [],
      profilePic:  state.profilePic  || null,
    }, { merge: true });
  } catch(e) { console.warn('Firestore main save failed:', e); }
}

// ─── SAVE SINGLE SHOW ─────────────────────────────────────────────────────────
function syncSaveShow(showId) {
  _pendingShows.add(String(showId));
  clearTimeout(_showsTimer);
  _showsTimer = setTimeout(_flushPendingShows, 1500);
}

async function _flushPendingShows() {
  if (!currentUser || !_pendingShows.size) return;
  const ids = [..._pendingShows];
  _pendingShows.clear();
  const ref = db.collection('users').doc(currentUser.uid).collection('shows');
  await Promise.all(ids.map(async id => {
    const d = state.shows[id];
    if (d) {
      try { await ref.doc(String(id)).set(d); } catch(e) {}
    } else {
      try { await ref.doc(String(id)).delete(); } catch(e) {}
    }
  }));
}

// ─── SAVE SEASONS ─────────────────────────────────────────────────────────────
async function syncSaveSeasons(showId) {
  if (!currentUser || !state.seasons[showId]) return;
  try {
    await db.collection('users').doc(currentUser.uid)
      .collection('seasons').doc(String(showId)).set(state.seasons[showId]);
  } catch(e) { console.warn('Seasons save failed:', e); }
}

// ─── IMPORT BATCH SAVE ────────────────────────────────────────────────────────
// Called after bulk import — saves all shows immediately in Firestore batches
async function syncSaveAllShows() {
  if (!currentUser) return;
  const ref    = db.collection('users').doc(currentUser.uid).collection('shows');
  const ids    = Object.keys(state.shows);
  const CHUNK  = 400; // Firestore batch limit is 500 ops
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = db.batch();
    ids.slice(i, i + CHUNK).forEach(id => {
      batch.set(ref.doc(String(id)), state.shows[id]);
    });
    try { await batch.commit(); } catch(e) { console.warn('Batch save failed:', e); }
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

// ─── OVERRIDES ────────────────────────────────────────────────────────────────
function save() {
  _localSave();
  syncSave();
  // Queue all modified shows
  Object.keys(state.shows).forEach(id => _pendingShows.add(id));
  clearTimeout(_showsTimer);
  _showsTimer = setTimeout(_flushPendingShows, 1500);
}

function load() { _localLoad(); }
