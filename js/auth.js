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
  setUserDisplay(
    (currentUsername || user.email)[0].toUpperCase(),
    currentUsername || user.email
  );
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

    setUserDisplay(
      (currentUsername || user.email)[0].toUpperCase(),
      currentUsername || user.email
    );

    // Only show modal if NEITHER cache NOR Firestore has a username
    if (!currentUsername) {
      // Double-check by searching usernames collection for this uid
      try {
        const usernamesSnap = await db.collection('usernames').where('uid', '==', uid).limit(1).get();
        if (!usernamesSnap.empty) {
          const foundName = usernamesSnap.docs[0].id;
          currentUsername = foundName;
          localStorage.setItem('sl_username_' + uid, foundName);
          // Also repair the user doc
          await db.collection('users').doc(uid).set({ username: foundName }, { merge: true });
          setUserDisplay(foundName[0].toUpperCase(), foundName);
        } else {
          showUsernameModal();
        }
      } catch(e) {
        showUsernameModal();
      }
    }

    // Load shows subcollection
    const showsSnap = await db.collection('users').doc(uid).collection('shows').get();
    showsSnap.forEach(doc => { state.shows[doc.id] = doc.data(); });

    // Load seasons subcollection
    const seasonsSnap = await db.collection('users').doc(uid).collection('seasons').get();
    seasonsSnap.forEach(doc => { state.seasons[doc.id] = doc.data(); });

    _localSave();
    render();
    setTimeout(() => { runUpToDateCheck(); render(); }, 300);

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
      avatarEl.textContent = initial.toUpperCase();
    }
  }
  if (emailEl) emailEl.textContent = label;
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
    // Check uniqueness
    const snap = await db.collection('usernames').doc(name).get();
    if (snap.exists) {
      error.textContent    = 'This username is taken. Try another.';
      btn.textContent      = 'Save Username';
      btn.disabled         = false;
      return;
    }

    const uid = currentUser.uid;
    // Claim username
    await db.collection('usernames').doc(name).set({ uid });
    // Save to user doc
    await db.collection('users').doc(uid).set({ username: name }, { merge: true });

    currentUsername = name;
    localStorage.setItem('sl_username_' + uid, name);
    setUserDisplay(name[0].toUpperCase(), name);
    hideUsernameModal();
  } catch(e) {
    error.textContent = 'Something went wrong. Try again.';
    btn.textContent   = 'Save Username';
    btn.disabled      = false;
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
async function logout() {
  await auth.signOut();
  localStorage.removeItem('sl_state');
  localStorage.removeItem('sl_seasons');
  window.location.href = 'login.html';
}
