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
      .map(d => ({ id: String(d.show.id), name: d.show.name, poster_path: d.show.poster_path || null, status: d.status, show_status: d.show.status || null }));

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
      } catch(e) { console.warn('Failed to fetch profile for', r.uid, e); }
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

// ─── FOLLOWER COUNTS ─────────────────────────────────────────────────────────
async function loadFollowerCount(uid) {
  try {
    const snap = await db.collection('follows').where('followeeId', '==', uid).get();
    return snap.size;
  } catch(e) { return 0; }
}

async function loadFollowingCount(uid) {
  try {
    const snap = await db.collection('follows').where('followerId', '==', uid).get();
    return snap.size;
  } catch(e) { return 0; }
}

// ─── FOLLOWERS / FOLLOWING MODAL ─────────────────────────────────────────────
async function openFollowModal(type, uid) {
  if (!uid) return;
  document.getElementById('follow-list-title').textContent = type === 'followers' ? 'Followers' : 'Following';
  document.getElementById('follow-list-modal').style.display = 'flex';
  const listEl = document.getElementById('follow-list-content');
  listEl.innerHTML = `<div style="text-align:center;padding:30px"><div class="spinner"></div></div>`;

  let users = [];
  try {
    if (type === 'following') {
      if (uid === currentUser?.uid) {
        users = Object.entries(_following).map(([fuid, info]) => ({ uid: fuid, username: info.username, profilePic: info.profilePic }));
      } else {
        const snap = await db.collection('follows').where('followerId', '==', uid).get();
        const uids = [];
        snap.forEach(doc => uids.push(doc.data().followeeId));
        users = await Promise.all(uids.map(fuid => _fetchPublicProfile(fuid)));
      }
    } else {
      const snap = await db.collection('follows').where('followeeId', '==', uid).get();
      const uids = [];
      snap.forEach(doc => uids.push(doc.data().followerId));
      users = await Promise.all(uids.map(fuid => _fetchPublicProfile(fuid)));
    }
  } catch(e) {
    listEl.innerHTML = `<div style="color:var(--text-muted);font-size:14px;padding:16px 0;text-align:center">Failed to load</div>`;
    return;
  }

  if (!users.length) {
    listEl.innerHTML = `<div style="color:var(--text-muted);font-size:14px;padding:24px 0;text-align:center">No ${type} yet</div>`;
    return;
  }

  listEl.innerHTML = users.map(u => {
    if (!u) return '';
    const pic      = u.profilePic;
    const initial  = (u.username || '?')[0].toUpperCase();
    const isSelf   = u.uid === currentUser?.uid;
    const following = isFollowing(u.uid);
    return `<div class="follow-user-item" onclick="closeFollowModal();viewUser('${u.uid}')">
      <div class="follow-user-avatar">
        ${pic ? `<img src="${escHtml(pic)}" loading="lazy">` : `<span>${escHtml(initial)}</span>`}
      </div>
      <div class="follow-user-name">@${escHtml(u.username || u.uid)}</div>
      ${!isSelf ? `<button class="people-follow-btn${following ? ' following' : ''}" data-uid="${u.uid}"
        onclick="event.stopPropagation();toggleFollow('${u.uid}')">
        ${following ? '✓ Following' : '+ Follow'}
      </button>` : ''}
    </div>`;
  }).join('');
}

async function _fetchPublicProfile(uid) {
  if (window._upCache?.[uid]?.username) return window._upCache[uid];
  try {
    const snap = await db.collection('publicProfiles').doc(uid).get();
    if (snap.exists) {
      const d = { uid, ...snap.data() };
      if (!window._upCache) window._upCache = {};
      window._upCache[uid] = d;
      return d;
    }
  } catch(e) { /* ignore */ }
  return { uid, username: uid, profilePic: null };
}

function closeFollowModal() {
  document.getElementById('follow-list-modal').style.display = 'none';
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
