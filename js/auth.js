// ─── AUTH ─────────────────────────────────────────────────────────────────────
let currentUser     = null;
let currentUsername = null;

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;

  // ── 1. Load from localStorage cache INSTANTLY and render right away ──────
  _localLoad();
  // Restore cached username immediately if we have one
  const cachedUname = localStorage.getItem('sl_username_' + user.uid);
  if (cachedUname) currentUsername = cachedUname;

  state.view = 'home';

  // FIX: null-safe label — handles phone auth or edge cases with no email
  const initialLabel = currentUsername || user.email || 'User';
  setUserDisplay(initialLabel[0].toUpperCase(), initialLabel);
  render();

  // ── 2. Fetch username & Firestore data in background ─────────────────────
  try {
    const uid      = user.uid;
    const userDoc  = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Merge Firestore data into state
    if (userData.customLists) state.customLists  = userData.customLists;
    if (userData.activityLog) state.activityLog  = userData.activityLog;
    if (userData.profilePic)  state.profilePic   = userData.profilePic;
    if (userData.favorites)   state.favorites    = userData.favorites;

    // Set username from Firestore (authoritative source)
    if (userData.username) {
      currentUsername = userData.username;
      localStorage.setItem('sl_username_' + uid, userData.username);
    }

    const displayLabel = currentUsername || user.email || 'User';
    setUserDisplay(displayLabel[0].toUpperCase(), displayLabel);

    // Only show modal if NEITHER cache NOR Firestore has a username
    if (!currentUsername) {
      try {
        const usernamesSnap = await db.collection('usernames').where('uid', '==', uid).limit(1).get();
        if (!usernamesSnap.empty) {
          const foundName = usernamesSnap.docs[0].id;
          currentUsername = foundName;
          localStorage.setItem('sl_username_' + uid, foundName);
          await db.collection('users').doc(uid).set({ username: foundName }, { merge: true });
          setUserDisplay(foundName[0].toUpperCase(), foundName);
        } else {
          showUsernameModal();
        }
      } catch(e) {
        showUsernameModal();
      }
    }

    // FIX: Clear local state before loading from Firestore.
    // Prevents deleted shows on other devices from persisting,
    // and prevents cross-account data leaks.
    state.shows   = {};
    state.seasons = {};

    // Load shows subcollection
    const showsSnap = await db.collection('users').doc(uid).collection('shows').get();
    showsSnap.forEach(doc => { state.shows[doc.id] = doc.data(); });

    // Load seasons subcollection
    const seasonsSnap = await db.collection('users').doc(uid).collection('seasons').get();
    seasonsSnap.forEach(doc => { state.seasons[doc.id] = doc.data(); });

    _localSave();
    render();
    setTimeout(() => { runUpToDateCheck(); render(); }, 300);
    syncPublicProfile();
    loadFollowing();

  } catch(e) {
    console.warn('Background sync failed:', e);
  }
});

function setUserDisplay(initial, label) {
  const avatarEl = document.getElementById('user-avatar');
  const emailEl  = document.getElementById('user-email');
  if (avatarEl) {
    if (state.profilePic) {
      avatarEl.style.backgroundImage = `url('${state.profilePic}')`;
      avatarEl.style.backgroundSize  = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = (initial || 'U').toUpperCase();
    }
  }
  if (emailEl) emailEl.textContent = label || '';
}

// ─── USERNAME MODAL ───────────────────────────────────────────────────────────
function showUsernameModal() {
  document.getElementById('username-modal').style.display = 'flex';
}

function hideUsernameModal() {
  document.getElementById('username-modal').style.display = 'none';
}

async function submitUsername() {
  const input = document.getElementById('username-input');
  const error = document.getElementById('username-error');
  const btn   = document.getElementById('username-btn');
  const raw   = input.value.trim();
  const name  = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');

  error.textContent = '';
  if (!name || name.length < 3)  { error.textContent = 'Username must be at least 3 characters.'; return; }
  if (name.length > 20)          { error.textContent = 'Username must be 20 characters or less.'; return; }
  if (raw !== name)              { error.textContent = 'Only letters, numbers and underscores allowed.'; return; }

  btn.textContent = 'Checking…';
  btn.disabled    = true;

  try {
    const uid          = currentUser.uid;
    const userRef      = db.collection('users').doc(uid);
    const usernameRef  = db.collection('usernames').doc(name);

    // FIX: Use a Firestore transaction to atomically claim the username.
    // Prevents two concurrent signups from claiming the same name.
    await db.runTransaction(async tx => {
      const snap = await tx.get(usernameRef);
      if (snap.exists) throw new Error('taken');
      tx.set(usernameRef, { uid });
      tx.set(userRef, { username: name }, { merge: true });
    });

    currentUsername = name;
    localStorage.setItem('sl_username_' + uid, name);
    const displayLabel = name;
    setUserDisplay(displayLabel[0].toUpperCase(), displayLabel);
    hideUsernameModal();
    syncPublicProfile();
  } catch(e) {
    if (e.message === 'taken') {
      error.textContent = 'This username is taken. Try another.';
    } else {
      error.textContent = 'Something went wrong. Try again.';
    }
    btn.textContent = 'Save Username';
    btn.disabled    = false;
  }
}

// ─── CHANGE USERNAME ─────────────────────────────────────────────────────────
function showChangeUsernameModal() {
  const input = document.getElementById('change-username-input');
  const error = document.getElementById('change-username-error');
  const btn   = document.getElementById('change-username-btn');
  if (input) input.value = '';
  if (error) error.textContent = '';
  if (btn)   { btn.textContent = 'Save Username'; btn.disabled = false; }
  document.getElementById('change-username-modal').style.display = 'flex';
  setTimeout(() => input?.focus(), 50);
}

function hideChangeUsernameModal() {
  document.getElementById('change-username-modal').style.display = 'none';
}

async function submitChangeUsername() {
  const input = document.getElementById('change-username-input');
  const error = document.getElementById('change-username-error');
  const btn   = document.getElementById('change-username-btn');
  const raw   = input.value.trim();
  const name  = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');

  error.textContent = '';
  if (!name || name.length < 3) { error.textContent = 'Username must be at least 3 characters.'; return; }
  if (name.length > 20)         { error.textContent = 'Username must be 20 characters or less.'; return; }
  if (raw !== name)             { error.textContent = 'Only letters, numbers and underscores allowed.'; return; }
  if (name === currentUsername) { error.textContent = 'This is already your username.'; return; }

  btn.textContent = 'Checking…';
  btn.disabled    = true;

  try {
    const uid        = currentUser.uid;
    const oldName    = currentUsername;
    const userRef    = db.collection('users').doc(uid);
    const newNameRef = db.collection('usernames').doc(name);
    const oldNameRef = oldName ? db.collection('usernames').doc(oldName) : null;

    await db.runTransaction(async tx => {
      const snap = await tx.get(newNameRef);
      if (snap.exists) throw new Error('taken');
      if (oldNameRef) tx.delete(oldNameRef);
      tx.set(newNameRef, { uid });
      tx.set(userRef, { username: name }, { merge: true });
    });

    currentUsername = name;
    localStorage.setItem('sl_username_' + uid, name);
    setUserDisplay(name[0].toUpperCase(), name);
    hideChangeUsernameModal();
    showToast('Username updated!');
    syncPublicProfile();
    if (state.view === 'profile') render();
  } catch(e) {
    if (e.message === 'taken') {
      error.textContent = 'This username is taken. Try another.';
    } else {
      error.textContent = 'Something went wrong. Try again.';
    }
    btn.textContent = 'Save Username';
    btn.disabled    = false;
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
async function logout() {
  // FIX: capture uid before signing out, then clear all cached data
  const uid = currentUser?.uid;
  await auth.signOut();
  localStorage.removeItem('sl_state');
  localStorage.removeItem('sl_seasons');
  // FIX: also clear the cached username key to prevent data leaks
  if (uid) localStorage.removeItem('sl_username_' + uid);
  window.location.href = 'login.html';
}
