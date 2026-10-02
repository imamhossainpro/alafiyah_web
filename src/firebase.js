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