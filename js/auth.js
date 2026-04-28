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
      tx.set(newNameRef, { uid, email: currentUser.email || '' });
      tx.set(userRef, { username: name }, { merge: true });
    });

    currentUsername = name;
    localStorage.setItem('sl_username_' + uid, name);
    setUserDisplay(name[0].toUpperCase(), name);
    hideChangeUsernameModal();
    showToast('Username updated!');
    syncPublicProfile();
    if (state.view === 'profile' || state.view === 'settings') render();
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

// ─── SETTINGS: CHANGE EMAIL ───────────────────────────────────────────────────
function showChangeEmailModal() {
  document.getElementById('ce-new-email').value = '';
  document.getElementById('ce-password').value  = '';
  document.getElementById('ce-error').textContent = '';
  const btn = document.getElementById('ce-btn');
  if (btn) { btn.textContent = 'Update Email'; btn.disabled = false; }
  document.getElementById('change-email-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('ce-new-email')?.focus(), 50);
}

function hideChangeEmailModal() {
  document.getElementById('change-email-modal').style.display = 'none';
}

async function submitChangeEmail() {
  const newEmail  = document.getElementById('ce-new-email').value.trim();
  const password  = document.getElementById('ce-password').value;
  const errorEl   = document.getElementById('ce-error');
  const btn       = document.getElementById('ce-btn');

  errorEl.textContent = '';
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    errorEl.textContent = 'Enter a valid email address.'; return;
  }
  if (!password) { errorEl.textContent = 'Enter your current password.'; return; }
  if (newEmail === currentUser?.email) { errorEl.textContent = 'This is already your email.'; return; }

  btn.textContent = 'Updating…'; btn.disabled = true;
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updateEmail(newEmail);
    await db.collection('usernames').doc(currentUsername).set({ email: newEmail }, { merge: true });
    hideChangeEmailModal();
    if (document.getElementById('user-email')) document.getElementById('user-email').textContent = currentUsername || newEmail;
    showToast('Email updated successfully');
    if (state.view === 'settings') renderSettings();
  } catch(e) {
    const msgs = {
      'auth/wrong-password':     'Incorrect password.',
      'auth/email-already-in-use': 'This email is already in use.',
      'auth/invalid-email':      'Invalid email address.',
      'auth/requires-recent-login': 'Please sign out and sign in again before changing your email.',
    };
    errorEl.textContent = msgs[e.code] || 'Something went wrong. Try again.';
    btn.textContent = 'Update Email'; btn.disabled = false;
  }
}

// ─── SETTINGS: CHANGE PASSWORD ────────────────────────────────────────────────
function showChangePasswordModal() {
  ['cp-current','cp-new','cp-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cp-error').textContent = '';
  const btn = document.getElementById('cp-btn');
  if (btn) { btn.textContent = 'Update Password'; btn.disabled = false; }
  document.getElementById('change-password-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('cp-current')?.focus(), 50);
}

function hideChangePasswordModal() {
  document.getElementById('change-password-modal').style.display = 'none';
}

async function submitChangePassword() {
  const current  = document.getElementById('cp-current').value;
  const newPwd   = document.getElementById('cp-new').value;
  const confirm  = document.getElementById('cp-confirm').value;
  const errorEl  = document.getElementById('cp-error');
  const btn      = document.getElementById('cp-btn');

  errorEl.textContent = '';
  if (!current)           { errorEl.textContent = 'Enter your current password.'; return; }
  if (newPwd.length < 6)  { errorEl.textContent = 'New password must be at least 6 characters.'; return; }
  if (newPwd !== confirm) { errorEl.textContent = 'Passwords do not match.'; return; }

  btn.textContent = 'Updating…'; btn.disabled = true;
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, current);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPwd);
    hideChangePasswordModal();
    showToast('Password updated successfully');
  } catch(e) {
    const msgs = {
      'auth/wrong-password':        'Incorrect current password.',
      'auth/requires-recent-login': 'Please sign out and sign in again before changing your password.',
    };
    errorEl.textContent = msgs[e.code] || 'Something went wrong. Try again.';
    btn.textContent = 'Update Password'; btn.disabled = false;
  }
}

// ─── SETTINGS: DELETE ACCOUNT ─────────────────────────────────────────────────
function showDeleteAccountModal() {
  document.getElementById('da-password').value    = '';
  document.getElementById('da-error').textContent = '';
  const btn = document.getElementById('da-btn');
  if (btn) { btn.textContent = 'Delete My Account'; btn.disabled = false; }
  document.getElementById('delete-account-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('da-password')?.focus(), 50);
}

function hideDeleteAccountModal() {
  document.getElementById('delete-account-modal').style.display = 'none';
}

async function submitDeleteAccount() {
  const password = document.getElementById('da-password').value;
  const errorEl  = document.getElementById('da-error');
  const btn      = document.getElementById('da-btn');

  errorEl.textContent = '';
  if (!password) { errorEl.textContent = 'Enter your password to confirm.'; return; }

  btn.textContent = 'Deleting…'; btn.disabled = true;
  try {
    const uid  = currentUser.uid;
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
    await currentUser.reauthenticateWithCredential(cred);

    // Delete Firestore data
    const showsSnap   = await db.collection('users').doc(uid).collection('shows').get();
    await _batchDeleteSnap(showsSnap);
    const seasonsSnap = await db.collection('users').doc(uid).collection('seasons').get();
    await _batchDeleteSnap(seasonsSnap);
    if (currentUsername) await db.collection('usernames').doc(currentUsername).delete().catch(() => {});
    await db.collection('publicProfiles').doc(uid).delete().catch(() => {});
    await db.collection('users').doc(uid).delete().catch(() => {});

    // Delete Firebase Auth account
    await currentUser.delete();

    localStorage.removeItem('sl_state');
    localStorage.removeItem('sl_seasons');
    if (uid) localStorage.removeItem('sl_username_' + uid);
    window.location.href = 'login.html';
  } catch(e) {
    const msgs = {
      'auth/wrong-password':        'Incorrect password.',
      'auth/requires-recent-login': 'Please sign out and sign in again before deleting your account.',
    };
    errorEl.textContent = msgs[e.code] || 'Something went wrong. Try again.';
    btn.textContent = 'Delete My Account'; btn.disabled = false;
  }
}

// ─── SETTINGS: REMOVE PROFILE PIC ─────────────────────────────────────────────
async function removeProfilePic() {
  state.profilePic = null;
  save();
  if (currentUser) {
    try { await db.collection('users').doc(currentUser.uid).set({ profilePic: null }, { merge: true }); } catch(e) {}
  }
  const label = currentUsername || currentUser?.email || 'U';
  setUserDisplay(label[0].toUpperCase(), label);
  if (state.view === 'settings') renderSettings();
  if (state.view === 'profile')  renderProfile();
  showToast('Profile photo removed');
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
