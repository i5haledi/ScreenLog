// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIGURATION
// Follow README.md to get these values from your Firebase project
// ─────────────────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAiyNTH-CcmrmuEyBXNRKvBqRg7dVMk7j8",
  authDomain:        "screenlog-8d99a.firebaseapp.com",
  projectId:         "screenlog-8d99a",
  storageBucket:     "screenlog-8d99a.firebasestorage.app",
  messagingSenderId: "320317394293",
  appId:             "1:320317394293:web:fc81c0ca52d63c37e2973c"
};

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();
