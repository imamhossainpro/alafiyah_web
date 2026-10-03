// src/firebase.js
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  Timestamp,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
} from 'firebase/firestore';
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage';
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyAhAGpQ4ACx-EDePKTxqjKXoS_qN2UoC2M',
  authDomain: 'alafiyahdoctors.firebaseapp.com',
  projectId: 'alafiyahdoctors',
  storageBucket: 'alafiyahdoctors.firebasestorage.app',
  messagingSenderId: '524797545432',
  appId: '1:524797545432:web:c07c1cfc4214a05b0380ad',
  measurementId: 'G-4JVEEPLLS1',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);

const auth = getAuth(app);

setPersistence(auth, browserSessionPersistence).catch((error) =>
  console.error('Auth persistence error:', error)
);

// ==================================================
// ✅ Google Analytics 4 (GA4)
// ==================================================
// GA4 শুধু browser-এ কাজ করে, SSR/Node-এ নয়
let analytics = null;

if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
        console.log('✅ GA4 Analytics initialized');
      } else {
        console.warn('⚠️ GA4 not supported in this environment');
      }
    })
    .catch((err) => {
      console.error('❌ GA4 initialization error:', err);
    });
}

export { analytics };

// ==================================================
// ✅ Analytics Helper — নিরাপদ event tracking
// ==================================================
/**
 * GA4-তে কাস্টম ইভেন্ট পাঠান (safe wrapper)
 * @param {string} eventName - GA4-এর allowed event name (snake_case)
 * @param {object} params - event parameters
 */
export const trackEvent = (eventName, params = {}) => {
  if (!analytics) {
    console.warn(`⚠️ Analytics not ready — skipped event: ${eventName}`);
    return;
  }
  try {
    logEvent(analytics, eventName, params);
    console.log(`📊 GA4 event: ${eventName}`, params);
  } catch (err) {
    console.error(`❌ GA4 logEvent error [${eventName}]:`, err);
  }
};

// ==================================================
// ✅ Exports — Auth
// ==================================================
export {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
};

// ==================================================
// ✅ Exports — Firestore
// ==================================================
export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  Timestamp,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
};

// ==================================================
// ✅ Exports — Storage
// ==================================================
export {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
};

// ==================================================
// ✅ Exports — Analytics
// ==================================================
export { logEvent, isSupported };