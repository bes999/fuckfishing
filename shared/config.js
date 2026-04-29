// ⚠️  Заполни своими значениями из Firebase Console → Project Settings → Your apps
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDNTOKH8mmiZrTzqytQT3GQHfVmKskBGbE",
  authDomain:        "fuckfishing-next.firebaseapp.com",
  projectId:         "fuckfishing-next",
  storageBucket:     "fuckfishing-next.firebasestorage.app",
  messagingSenderId: "707438896052",
  appId:             "1:707438896052:web:4fb21f3821cc39a1c1c8e1"
};

const TRIP_ID = 'sakhalin2026';

firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();

// Оффлайн-персистентность
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
