// src/components/AuthPage.jsx
import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { trackEvent } from '../firebase';   // ✅ GA4

const DEFAULT_HOSPITAL_ID = 'alafiyah_main';

export default function AuthPage({ onClose }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // hospital পাথে ইউজার ডকুমেন্ট চেক
        const userDoc = await getDoc(doc(db, 'hospitals', DEFAULT_HOSPITAL_ID, 'users', user.uid));
        if (!userDoc.exists()) {
          await setDoc(doc(db, 'hospitals', DEFAULT_HOSPITAL_ID, 'users', user.uid), {
            name: user.displayName || '',
            email: user.email,
            role: 'viewer',
            approved: false,
            hospitalId: DEFAULT_HOSPITAL_ID,
            createdAt: new Date().toISOString(),
          });
        }

        // ✅ GA4 — login event
        trackEvent('login', { method: 'email' });

        onClose && onClose();
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        await setDoc(doc(db, 'hospitals', DEFAULT_HOSPITAL_ID, 'users', user.uid), {
          name,
          email,
          role: 'viewer',
          approved: false,
          designation: designation || '',
          hospitalId: DEFAULT_HOSPITAL_ID,
          createdAt: new Date().toISOString(),
          uid: user.uid,
        });

        // ✅ GA4 — sign_up event
        trackEvent('sign_up', { method: 'email' });

        onClose && onClose();
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  // ইনলাইন স্টাইল (Tailwind ছাড়া)
  const overlayStyle = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  };
  const modalStyle = {
    background: '#fff',
    borderRadius: '16px',
    maxWidth: '400px',
    width: '100%',
    padding: '24px',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  };
  const closeBtnStyle = {
    position: 'absolute',
    top: '12px',
    right: '16px',
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#888',
  };
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    marginTop: '4px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
  };
  const btnStyle = {
    width: '100%',
    padding: '10px',
    background: '#1c5fa8',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '16px',
    cursor: 'pointer',
  };
  const errorStyle = {
    color: '#dc2626',
    fontSize: '14px',
    backgroundColor: '#fee2e2',
    padding: '8px 12px',
    borderRadius: '6px',
    marginBottom: '12px',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <button style={closeBtnStyle} onClick={onClose}>✕</button>
        <h2 style={{ textAlign: 'center', fontSize: '22px', marginBottom: '16px' }}>
          {isLogin ? 'লগইন করুন' : 'রেজিস্ট্রেশন করুন'}
        </h2>
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600' }}>পূর্ণ নাম</label>
                <input style={inputStyle} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600' }}>পদবী (ঐচ্ছিক)</label>
                <input style={inputStyle} type="text" value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
            </>
          )}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600' }}>ইমেইল</label>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600' }}>পাসওয়ার্ড</label>
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          <button style={btnStyle} type="submit" disabled={loading}>
            {loading ? 'লোড হচ্ছে...' : (isLogin ? 'লগইন করুন' : 'রেজিস্ট্রেশন করুন')}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '14px', marginTop: '16px' }}>
          {isLogin ? 'নতুন ব্যবহারকারী? ' : 'ইতিমধ্যে অ্যাকাউন্ট আছে? '}
          <button onClick={() => setIsLogin(!isLogin)} style={{ color: '#1c5fa8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
            {isLogin ? 'রেজিস্ট্রেশন করুন' : 'লগইন করুন'}
          </button>
        </p>
      </div>
    </div>
  );
}