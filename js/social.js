// ─── SOCIAL ──────────────────────────────────────────────────────────────────
// publicProfiles/{uid}           — readable by any authenticated user
// follows/{followerId_followeeId} — follow relationships

let _following    = {};   // { [uid]: { username, profilePic } }
let _pubSyncTimer = null;

// ─── PUBLIC PROFILE SYNC ─────────────────────────────────────────────────────
// Called after login and debounced after any show/activity change.
// Writes a lightweight public snapshot so other users can view this profile.
function schedulePublicSync() {
  clearTimeout(_pubSyncTimer);
  _pubSyncTimer = setTimeout(syncPublicProfile, 15000);
}

async function syncPublicProfile() {
  if (!currentUser || !currentUsername) return;
  try {
    const uid      = currentUser.uid;
    const allShows = Object.values(state.shows);
    const watching  = allShows.filter(d => d.status === 'watching').length;
    const completed = allShows.filter(d => d.status === 'completed').length;
    const watchlist = allShows.filter(d => d.status === 'watchlist').length;
    let totalEps = 0;
    allShows.forEach(d => { totalEps += Object.values(d.watched || {}).filter(Boolean).length; });

    const shows = allShows
      .filter(d => d.show)
      .map(d => ({ id: String(d.show.id), name: d.show.name, poster_path: d.show.poster_path || null, status: d.status }));

    await db.collection('publicProfiles').doc(uid).set({
      username:    currentUsername,
      profilePic:  state.profilePic || null,
      favorites:   state.favorites  || [],
      activityLog: (state.activityLog || []).slice(0, 30),
      stats:       { totalShows: allShows.length, watching, completed, watchlist, totalEps },
      shows,
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch(e) { console.warn('Public profile sync failed:', e); }
}

// ─── FOLLOW / UNFOLLOW ────────────────────────────────────────────────────────
async function loadFollowing() {
  if (!currentUser) return;
  try {
    const snap = await db.collection('follows')
      .where('followerId', '==', currentUser.uid)
      .get();
    _following = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (d.followeeId) _following[d.followeeId] = { username: d.followeeUsername || '', profilePic: d.followeeProfilePic || null };
    });
  } catch(e) { console.warn('Load following failed:', e); }
}

function isFollowing(uid) { return !!_following[uid]; }

async function followUser(uid, username, profilePic) {
  if (!currentUser || uid === currentUser.uid) return;
  try {
    await db.collection('follows').doc(currentUser.uid + '_' + uid).set({
      followerId:         currentUser.uid,
      followeeId:         uid,
      followeeUsername:   username || '',
      followeeProfilePic: profilePic || null,
      followedAt:         firebase.firestore.FieldValue.serverTimestamp(),
    });
    _following[uid] = { username: username || '', profilePic: profilePic || null };
    _refreshFollowButtons(uid);
  } catch(e) { showToast('Could not follow. Check connection.'); }
}

async function unfollowUser(uid) {
  if (!currentUser) return;
  try {
    await db.collection('follows').doc(currentUser.uid + '_' + uid).delete();
    delete _following[uid];
    _refreshFollowButtons(uid);
  } catch(e) { showToast('Could not unfollow. Check connection.'); }
}

function toggleFollow(uid) {
  const cached = window._upCache?.[uid];
  if (isFollowing(uid)) unfollowUser(uid);
  else followUser(uid, cached?.username || '', cached?.profilePic || null);
}

// Update all follow buttons for a uid without re-rendering the whole page
function _refreshFollowButtons(uid) {
  const following = isFollowing(uid);
  document.querySelectorAll(`.people-follow-btn[data-uid="${uid}"]`).forEach(btn => {
    btn.textContent = following ? '✓ Following' : '+ Follow';
    btn.className   = 'people-follow-btn' + (following ? ' following' : '');
  });
  const heroBtn = document.getElementById('follow-btn-' + uid);
  if (heroBtn) {
    heroBtn.textContent = following ? '✓ Following' : '+ Follow';
    heroBtn.className   = 'btn' + (following ? '' : ' primary');
  }
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
async function searchUsers(query) {
  const q = query.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!q || q.length < 2) return [];
  try {
    // Firestore prefix query on document IDs (usernames collection)
    const snap = await db.collection('usernames')
      .where(firebase.firestore.FieldPath.documentId(), '>=', q)
      .where(firebase.firestore.FieldPath.documentId(), '<=', q + '')
      .limit(12)
      .get();
    const results = [];
    snap.forEach(doc => {
      const uid = doc.data().uid;
      if (uid && uid !== currentUser?.uid) results.push({ uid, username: doc.id });
    });
    // Fetch profile pics + stats in parallel
    await Promise.all(results.map(async r => {
      try {
        const p = await db.collection('publicProfiles').doc(r.uid).get();
        if (p.exists) { const d = p.data(); r.profilePic = d.profilePic || null; r.stats = d.stats || {}; }
      } catch(e) {}
    }));
    return results;
  } catch(e) { return []; }
}

// ─── LOAD USER PROFILE ────────────────────────────────────────────────────────
async function loadUserProfile(uid) {
  try {
    const snap = await db.collection('publicProfiles').doc(uid).get();
    if (!snap.exists) return null;
    return { uid, ...snap.data() };
  } catch(e) { return null; }
}

// ─── DISCOVER USERS ───────────────────────────────────────────────────────────
async function loadDiscoverUsers(limit = 30) {
  try {
    const snap = await db.collection('publicProfiles')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    const results = [];
    snap.forEach(doc => {
      if (doc.id !== currentUser?.uid) {
        const d = doc.data();
        results.push({ uid: doc.id, username: d.username || '', profilePic: d.profilePic || null, stats: d.stats || {} });
      }
    });
    return results;
  } catch(e) { console.warn('Load discover failed:', e); return []; }
}
