# Screenlog — TV Tracker

A personal TV show tracker with cross-device sync, built with Firebase.

---

## 🚀 Setup (5 minutes)

### Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → give it a name (e.g. `screenlog`) → Continue
3. Disable Google Analytics (optional) → **Create project**

---

### Step 2 — Enable Authentication

1. In your Firebase project, go to **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in method**, enable:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → add your support email → Save

---

### Step 3 — Create Firestore Database

1. Go to **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → Next
4. Select a location close to you → **Enable**
5. Go to the **Rules** tab and replace the content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /usernames/{username} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }
  }
}
```

6. Click **Publish**

---

### Step 4 — Get Your Firebase Config

1. Go to **Project Settings** (gear icon ⚙️ at the top left)
2. Scroll down to **"Your apps"** → Click **"</> Web"**
3. Register the app (give it a nickname like `screenlog-web`) → **Register app**
4. Copy the `firebaseConfig` object

---

### Step 5 — Add Config to the App

Open `js/firebase-config.js` and replace the placeholder values:

```js
const FIREBASE_CONFIG = {
  apiKey:            "your-actual-api-key",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId:             "your-app-id"
};
```

---

### Step 6 — Deploy

**Option A — Netlify (easiest, free)**
1. Go to [netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `screenlog/` folder onto the page
3. You get a live URL instantly

**Option B — GitHub Pages**
1. Push the `screenlog/` folder to a GitHub repo
2. Go to Settings → Pages → Deploy from main branch
3. Access at `https://yourusername.github.io/repo-name`

---

## ✅ Features

- 📺 Search any TV show (TMDB database)
- ✓ Track episodes & seasons
- 🔄 Cross-device sync via Firebase
- 🔐 Email/password + Google sign-in
- 📋 Custom lists
- 📊 Activity log
- 📱 Mobile responsive

---

## 📁 Project Structure

```
screenlog/
├── index.html          # Main app
├── login.html          # Login page
├── signup.html         # Signup page
├── css/
│   ├── style.css       # App styles
│   └── auth.css        # Auth page styles
├── js/
│   ├── config.js       # TMDB API config
│   ├── firebase-config.js  # ← Fill this in!
│   ├── state.js        # App state & helpers
│   ├── sync.js         # Firestore sync
│   ├── api.js          # TMDB API calls
│   ├── render.js       # UI render functions
│   ├── auth.js         # Firebase auth logic
│   └── app.js          # Navigation & actions
└── README.md
```
