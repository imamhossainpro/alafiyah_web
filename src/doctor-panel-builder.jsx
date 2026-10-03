// src/doctor-panel-builder.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppShellSkeleton } from './components/ui/SkeletonScreens';
import {
  Plus, Ear, Trash2, Pencil, Printer, X, ChevronUp, ChevronDown, ChevronLeft, MapPin, Globe, Phone, Loader2,
  Stethoscope, Scissors, Heart, Baby, Bone, Syringe, Pill, Activity, Brain, Eye, Utensils, Smile, Sparkles, User, Droplet, Thermometer, LogOut,
  CheckCircle, XCircle, RefreshCw, Link as LinkIcon, Copy, QrCode, Check, Camera, Upload,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { db, doc, getDoc, setDoc, getDocs, collection, deleteDoc, updateDoc, query, where, writeBatch, trackEvent } from './firebase';
import BookingSystem from './BookingSystem';
import AdminDashboard from './components/AdminDashboard';
import NotificationBell from './components/NotificationBell';
import NotFoundPage from './components/NotFoundPage';
import { useHospital } from './context/HospitalContext';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';

const uid = () => Math.random().toString(36).slice(2, 10);
const DAY_NAMES = ['শনিবার', 'রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার'];
function titleForName(name) { return DAY_NAMES.indexOf(name) !== -1 ? name + 'ের ডক্টরস প্যানেল' : name; }

const ICONS = { Stethoscope, Scissors, Heart, Baby, Bone, Syringe, Pill, Activity, Brain, Eye, Utensils, Smile, Sparkles, User, Droplet, Thermometer, Ear };
const ICON_KEYS = Object.keys(ICONS);
const COLOR_THEMES = ['#1c5fa8', '#2f9e52', '#9c3a9c', '#d1392f', '#0e8ca3', '#e0653a', '#2b3f8f', '#159a72', '#8a6a2e', '#7a2d5c', '#4438ab', '#475569'];

// ==================================================
// ✅ GA4 — Booking link builder with UTM parameters
// ==================================================
const BOOKING_BASE_URL = 'https://doctors.alafiyahhospital.com';

/**
 * ডাক্তারের booking URL generate করে GA4 UTM tracking সহ
 * @param {string} doctorId - ডাক্তারের unique ID
 * @param {string} doctorName - ডাক্তারের নাম (utm_content এর জন্য)
 * @param {string} source - traffic source: 'qr' | 'direct' | 'web'
 * @returns {string} - পূর্ণ booking URL
 */
const buildBookingUrl = (doctorId, doctorName = '', source = 'qr') => {
  if (!doctorId) return null;

  const params = new URLSearchParams();

  if (source === 'qr') {
    // ✅ QR code scan থেকে আসা রোগীদের জন্য
    params.set('utm_source', 'qr');
    params.set('utm_medium', 'offline');
    params.set('utm_campaign', `doctor_${doctorId}`);
    if (doctorName) {
      params.set('utm_content', encodeURIComponent(doctorName));
    }
  } else if (source === 'direct') {
    // ✅ "সিরিয়াল নিন" button click থেকে (screen-এর ভেতরে)
    params.set('utm_source', 'website');
    params.set('utm_medium', 'web_button');
    params.set('utm_campaign', `doctor_${doctorId}`);
    if (doctorName) {
      params.set('utm_content', encodeURIComponent(doctorName));
    }
  }

  const queryString = params.toString();
  return `${BOOKING_BASE_URL}/booking/${doctorId}${queryString ? `?${queryString}` : ''}`;
};

// ==================================================
// ✅ html2canvas ignore helper
// ==================================================
const html2canvasIgnoreElements = (el) => {
  if (!el || !el.classList) return false;
  return (
    el.classList.contains('serial-booking-button') ||
    el.classList.contains('no-print')
  );
};

// ==================================================
// ✅ Per-day department ordering helper
// ==================================================
const getOrderedDepartments = (departments, panelDepartmentOrder) => {
  if (!departments || departments.length === 0) return [];

  if (!panelDepartmentOrder || panelDepartmentOrder.length === 0) {
    return [...departments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const orderMap = {};
  panelDepartmentOrder.forEach((deptId, index) => {
    orderMap[deptId] = index;
  });

  return [...departments].sort((a, b) => {
    const aOrder = orderMap[a.id] ?? 9999;
    const bOrder = orderMap[b.id] ?? 9999;
    return aOrder - bOrder;
  });
};

// ==================================================
// ✅ Time Utilities
// ==================================================
const TIME_REGEX = /^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM|am|pm)$/;

const validateTimeFormat = (timeStr) => {
  if (!timeStr || !timeStr.trim()) return false;
  return TIME_REGEX.test(timeStr.trim());
};

const standardizeTime = (timeStr) => {
  if (!timeStr || !timeStr.trim()) return '';
  const match = timeStr.trim().match(TIME_REGEX);
  if (!match) return timeStr.trim();
  const [, hour, minute, period] = match;
  const h = hour.padStart(2, '0');
  const p = period.toUpperCase();
  return `${h}:${minute} ${p}`;
};

const timeToMinutes = (timeStr) => {
  const match = timeStr?.trim().match(TIME_REGEX);
  if (!match) return null;
  let [, hour, minute, period] = match;
  let h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  const p = period.toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

function makeDoctor(overrides) {
  return {
    id: uid(),
    name: '',
    nameEn: '',
    quals: '',
    specialty: '',
    workplace: '',
    timeSlots: [],
    imageUrl: '',
    ...(overrides || {}),
  };
}
function makeDepartment(overrides) { return { id: uid(), name: '', icon: 'Stethoscope', color: COLOR_THEMES[0], doctors: [], ...(overrides || {}) }; }

const DEFAULT_FOOTER = {
  address: 'বাকলিয়া এক্সেস রোড,\nবাকলিয়া, চট্টগ্রাম।',
  website: 'alafiyahhospital.com',
  logo: '/logo.png',
  contactLabel: 'সিরিয়ালের এবং তথ্যের জন্যে যোগাযোগ',
  phones: ['01886 776 512', '01886 776 513'],
  hospitalName: 'আল-আফিয়া হাসপাতাল',
  hospitalSubtitle: 'স্বাস্থ্যসেবায় বিশ্বাস'
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap');

.dpb{font-family:'Hind Siliguri','Noto Sans Bengali',Arial,sans-serif;background:#f4f6fa;color:#1f2937;min-height:100vh;width:100%;}
.dpb *{box-sizing:border-box;}
.dpb h1,.dpb h2,.dpb h3,.dpb p{margin:0;padding:0;}
.dpb button{font-family:inherit;cursor:pointer;}

.dpb .topbar{display:flex;align-items:center;justify-content:space-between;background:#ffffff;border-bottom:1px solid #e2e6ee;padding:14px 20px;position:sticky;top:0;z-index:20;flex-wrap:wrap;gap:10px;width:100%;}
.dpb .topbar-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px;color:#154a82;}
.dpb .topbar-right{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.dpb .save-indicator{font-size:12.5px;color:#6b7280;white-space:nowrap;}

.dpb .logout-btn{background:#dc2626;color:#fff;border:none;border-radius:12px;padding:8px 14px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:5px;cursor:pointer;box-shadow:0 3px 10px rgba(220,38,38,0.30);transition:all 0.2s ease;}
.dpb .logout-btn:hover{background:#b91c1c;transform:translateY(-1px);box-shadow:0 5px 14px rgba(220,38,38,0.40);}

.dpb .login-btn{background:#1c5fa8;color:#fff;border:none;border-radius:12px;padding:8px 14px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:5px;cursor:pointer;box-shadow:0 3px 10px rgba(28,95,168,0.30);transition:all 0.2s ease;}
.dpb .login-btn:hover{background:#154a82;transform:translateY(-1px);box-shadow:0 5px 14px rgba(28,95,168,0.40);}

.dpb .tabs{display:flex;background:transparent;border-radius:12px;padding:3px;gap:6px;flex-wrap:wrap;}
.dpb .tab{border:none;background:#f1f5f9;padding:9px 16px;border-radius:12px;font-size:13.5px;font-weight:600;color:#64748b;cursor:pointer;transition:all 0.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.05);}
.dpb .tab:hover{background:#e2e8f0;color:#334155;box-shadow:0 2px 6px rgba(0,0,0,0.08);}
.dpb .tab.active{background:#1c5fa8;color:#fff;box-shadow:0 4px 12px rgba(28,95,168,0.35);}
.dpb .tab.booking-tab{background:linear-gradient(45deg,#0d9488,#14b8a6);color:#fff;font-weight:700;display:flex;align-items:center;gap:6px;border-radius:12px;box-shadow:0 4px 12px rgba(13,148,136,0.35);transition:all 0.3s ease;}
.dpb .tab.booking-tab:hover{background:linear-gradient(45deg,#0f766e,#0d9488);box-shadow:0 6px 16px rgba(13,148,136,0.45);transform:translateY(-1px);}
.dpb .tab.booking-tab.active{background:linear-gradient(45deg,#0f766e,#14b8a6);box-shadow:0 6px 16px rgba(13,148,136,0.55);border:1px solid rgba(255,255,255,0.2);}
.dpb .tab.booking-tab svg{animation:pulse-booking 2s infinite;}
@keyframes pulse-booking{0%,100%{transform:scale(1);}50%{transform:scale(1.1);}}

.dpb .panel-switcher{display:flex;align-items:center;gap:10px;padding:10px 20px;background:#fff;border-bottom:1px solid #e2e6ee;flex-wrap:wrap;position:relative;z-index:18;}
.dpb .panel-switcher-scroll{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0;}

.dpb .panel-pill{display:flex;align-items:center;border:1px solid #e2e6ee;background:#fff;padding:5px 10px;border-radius:20px;font-size:13px;font-weight:600;color:#1f2937;cursor:pointer;transition:all 0.2s ease;gap:4px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}
.dpb .panel-pill:hover{border-color:#1c5fa8;color:#1c5fa8;transform:translateY(-1px);box-shadow:0 3px 8px rgba(28,95,168,0.15);}
.dpb .panel-pill.active{background:#1c5fa8;color:#fff;border-color:#1c5fa8;box-shadow:0 4px 10px rgba(28,95,168,0.35);}
.dpb .panel-pill-label{background:transparent;border:none;font-weight:600;font-size:13px;color:inherit;cursor:pointer;}
.dpb .panel-pill-icon{background:transparent;border:none;display:flex;align-items:center;gap:2px;color:inherit;cursor:pointer;font-size:11px;font-weight:600;padding:2px 4px;border-radius:8px;transition:background 0.2s;}
.dpb .panel-pill-icon:hover{background:rgba(28,95,168,0.15);}
.dpb .panel-pill-icon.danger-confirm{color:#dc2626;font-weight:700;}
.dpb .panel-add-btn{padding:7px 14px;font-size:12.5px;border-radius:12px;}

.dpb .loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:10px;color:#6b7280;}
.dpb .spin{animation:dpb-spin 1s linear infinite;}
@keyframes dpb-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

.dpb .edit-panel{max-width:880px;margin:0 auto;padding:20px;display:flex;flex-direction:column;gap:18px;}
.dpb .panel-section{background:#fff;border:1px solid #e2e6ee;border-radius:14px;padding:18px 20px;}
.dpb .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;}
.dpb .panel-section > label{font-weight:700;font-size:14.5px;color:#1f2937;display:block;}
.dpb .section-header label{font-weight:700;font-size:14.5px;color:#1f2937;}
.dpb .section-hint{font-size:12.5px;color:#6b7280;margin:4px 0 10px;}

.dpb .day-buttons{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px;}
.dpb .day-btn{border:1px solid #e2e6ee;background:#fff;padding:7px 14px;border-radius:20px;font-size:12.5px;color:#1f2937;transition:all 0.2s ease;box-shadow:0 1px 2px rgba(0,0,0,0.04);}
.dpb .day-btn:hover{border-color:#1c5fa8;color:#1c5fa8;transform:translateY(-1px);box-shadow:0 3px 8px rgba(28,95,168,0.15);}

.dpb .input,.dpb .textarea{width:100%;border:1px solid #e2e6ee;border-radius:10px;padding:10px 14px;font-size:14px;font-family:inherit;color:#1f2937;background:#fff;transition:all 0.2s;}
.dpb .input:focus,.dpb .textarea:focus{outline:none;border-color:#1c5fa8;box-shadow:0 0 0 3px rgba(28,95,168,0.14);}
.dpb .textarea{resize:vertical;line-height:1.5;}
.dpb .field{margin-bottom:12px;}
.dpb .field label,.dpb .modal-body label{display:block;font-size:12.5px;font-weight:600;color:#6b7280;margin:0 0 5px;}

.dpb .checkbox-row{display:flex;align-items:center;gap:8px;font-size:13px;color:#1f2937;cursor:pointer;font-weight:500;}
.dpb .checkbox-row input{width:16px;height:16px;cursor:pointer;flex-shrink:0;}

.dpb .btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:12px;padding:9px 16px;font-size:13.5px;font-weight:600;white-space:nowrap;transition:all 0.2s ease;}
.dpb .btn-primary{background:#1c5fa8;color:#fff;box-shadow:0 3px 10px rgba(28,95,168,0.30);}
.dpb .btn-primary:hover{background:#154a82;transform:translateY(-1px);box-shadow:0 5px 14px rgba(28,95,168,0.40);}
.dpb .btn-primary:disabled{background:#b9c9dd;cursor:not-allowed;box-shadow:none;transform:none;}
.dpb .btn-secondary{background:#eef1f7;color:#1f2937;box-shadow:0 2px 6px rgba(0,0,0,0.06);}
.dpb .btn-secondary:hover{background:#e2e6ee;transform:translateY(-1px);box-shadow:0 4px 10px rgba(0,0,0,0.10);}
.dpb .btn-danger{background:#dc2626;color:#fff;box-shadow:0 3px 10px rgba(220,38,38,0.30);}
.dpb .btn-danger:hover{background:#b91c1c;transform:translateY(-1px);box-shadow:0 5px 14px rgba(220,38,38,0.40);}
.dpb .btn-outline{background:#fff;border:1px solid #e2e6ee;color:#1f2937;box-shadow:0 1px 3px rgba(0,0,0,0.04);}
.dpb .btn-outline:hover{border-color:#cbd5e1;box-shadow:0 3px 8px rgba(0,0,0,0.08);transform:translateY(-1px);}

.dpb .toggle-all-btn{background:#1c5fa8;color:#fff;border:none;border-radius:20px;padding:5px 16px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s ease;box-shadow:0 2px 8px rgba(28,95,168,0.30);}
.dpb .toggle-all-btn:hover{background:#154a82;transform:translateY(-1px);box-shadow:0 4px 12px rgba(28,95,168,0.40);}

.dpb .dept-toggle-btn{background:transparent;border:1.5px solid #1c5fa8;color:#1c5fa8;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s ease;}
.dpb .dept-toggle-btn:hover{background:#eaf2fb;box-shadow:0 2px 6px rgba(28,95,168,0.15);}

.dpb .dept-card{border:1px solid #e2e6ee;border-left:5px solid #ccc;border-radius:14px;margin-bottom:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.03);}
.dpb .dept-card-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fafbfd;flex-wrap:wrap;gap:8px;}
.dpb .dept-card-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.dpb .dept-card-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dpb .dept-card-title strong{font-size:14.5px;}
.dpb .dept-doctor-count{font-size:11.5px;color:#6b7280;background:#eef1f7;padding:3px 10px;border-radius:20px;}
.dpb .dept-card-actions{display:flex;gap:4px;}

.dpb .icon-btn{background:transparent;border:1px solid transparent;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#6b7280;flex-shrink:0;transition:all 0.2s ease;}
.dpb .icon-btn:hover{background:#eef1f7;color:#1f2937;box-shadow:0 2px 6px rgba(0,0,0,0.08);}
.dpb .icon-btn:disabled{opacity:0.35;cursor:not-allowed;box-shadow:none;}
.dpb .icon-btn.danger-confirm{background:#dc2626;color:#fff;width:auto;padding:0 12px;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(220,38,38,0.30);}
.dpb .icon-btn.link-btn{color:#0891b2;}
.dpb .icon-btn.link-btn:hover{background:#cffafe;color:#0e7490;}

.dpb .doctor-mini-list{padding:4px 14px 12px;}
.dpb .doctor-row{display:flex;align-items:center;justify-content:space-between;padding:9px 4px;border-top:1px dashed #e2e6ee;gap:10px;}
.dpb .doctor-checkbox{width:18px;height:18px;flex-shrink:0;cursor:pointer;accent-color:#1c5fa8;margin-right:4px;}
.dpb .doctor-row-info{min-width:0;flex:1;}
.dpb .doctor-row-name{font-size:16px;font-weight:700;color:#1f2937;}
.dpb .doctor-row-specialty{font-size:12px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;}
.dpb .doctor-row-time-slots{font-size:12px;color:#b45309;margin-top:4px;display:flex;flex-direction:column;gap:2px;}
.dpb .doctor-row-time-slot-item{background:#fef3c7;padding:3px 12px;border-radius:12px;display:inline-block;width:fit-content;}
.dpb .doctor-row-actions{display:flex;gap:2px;flex-shrink:0;}

.dpb .add-doctor-btn{display:flex;align-items:center;gap:6px;width:100%;justify-content:center;border:1.5px dashed #e2e6ee;background:transparent;border-radius:10px;padding:10px;font-size:12.5px;color:#6b7280;margin-top:6px;transition:all 0.2s ease;}
.dpb .add-doctor-btn:hover{border-color:#1c5fa8;color:#1c5fa8;background:#f0f7ff;box-shadow:0 2px 8px rgba(28,95,168,0.10);}

.dpb .empty-state{text-align:center;color:#6b7280;font-size:13px;padding:20px;}

.dpb .footer-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;}
@media (max-width:600px){.dpb .footer-form-grid{grid-template-columns:1fr;}}
.dpb .danger-zone{border:1px dashed #f0b4b4;background:#fff8f8;border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
.dpb .danger-zone-title{font-weight:700;font-size:13.5px;margin-bottom:2px;}
.dpb .danger-zone-text{font-size:12.5px;color:#8a3a3a;}

.dpb .modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.5);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;}
.dpb .modal-box{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);}
.dpb .modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e6ee;}
.dpb .modal-header h3{font-size:16px;}
.dpb .modal-body{padding:16px 20px;overflow-y:auto;}
.dpb .modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #e2e6ee;}

.dpb .icon-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}
.dpb .icon-choice{border:1.5px solid #e2e6ee;background:#fff;border-radius:10px;height:38px;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;}
.dpb .icon-choice:hover{transform:translateY(-1px);box-shadow:0 3px 8px rgba(0,0,0,0.08);}
.dpb .color-grid{display:flex;flex-wrap:wrap;gap:8px;}
.dpb .color-choice{width:34px;height:34px;border-radius:50%;border:2px solid transparent;padding:0;transition:all 0.2s ease;}
.dpb .color-choice:hover{transform:scale(1.08);}
.dpb .color-choice.selected{border-color:#1f2937;box-shadow:0 0 0 2px #fff inset;}

.dpb .preview-wrap{max-width:1000px;margin:0 auto;padding:20px;}
.dpb .preview-toolbar{display:flex;justify-content:flex-end;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
.dpb .preview-toolbar .btn{font-size:13px;padding:9px 18px;border-radius:12px;}
.dpb .poster-page{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 18px rgba(15,23,42,0.08);border:1px solid #e2e6ee;}
.dpb .poster-header{background:linear-gradient(120deg,#4fa3d1,#1c5fa8);padding:22px 20px;text-align:center;}
.dpb .poster-header h1{color:#fff;font-size:30px;font-weight:800;letter-spacing:0.3px;font-family:'Hind Siliguri','Noto Sans Bengali',Arial,sans-serif;}
.dpb .poster-body{column-count:3;column-gap:26px;padding:22px;text-align:left;}
@media (max-width:820px){.dpb .poster-body{column-count:2;}.dpb .poster-header h1{font-size:20px;}}
@media (max-width:560px){.dpb .poster-body{column-count:1;}}

.dpb .dept-block{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;margin-bottom:0;display:inline-block;width:100%;height:auto;}
.dpb .dept-header-wrap{display:flex;align-items:center;margin-bottom:10px;}
.dpb .dept-icon-box{width:34px;height:34px;background:#fff;border:2px solid;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,0.15);}
.dpb .dept-ribbon{flex:1;margin-left:-12px;padding:7px 14px 7px 22px;color:#fff;font-weight:700;font-size:18px;clip-path:polygon(0 0,94% 0,100% 50%,94% 100%,0 100%);min-height:34px;display:flex;align-items:center;}

.dpb .doctor-entry{margin-bottom:18px;padding:1px 0 1px 10px;border-left:3px solid #ccc;text-align:left;}
.dpb .doctor-name{color:#1c5fa8;font-weight:700;font-size:22px;margin-bottom:1px;}
.dpb .doctor-quals{color:#333;font-size:12px;line-height:1.45;white-space:pre-line;}
.dpb .doctor-specialty{color:#9c2a7e;font-weight:700;font-size:15px;white-space:pre-line;margin-top:2px;}
.dpb .doctor-workplace{color:#333;font-size:12px;line-height:1.4;white-space:pre-line;margin-top:1px;}
.dpb .doctor-time-slots{margin-top:6px;display:flex;flex-direction:column;gap:4px;}
.dpb .doctor-time-slot-item{background:#fef3c7;padding:4px 16px;border-radius:20px;font-size:13px;color:#b45309;font-weight:600;display:inline-block;width:fit-content;}
.dpb .doctor-time-label{font-weight:700;color:#b45309;font-size:13px;margin-right:2px;white-space:nowrap;}
.dpb .empty-dept-note{font-size:11.5px;color:#6b7280;font-style:italic;}

/* ✅ সিরিয়াল নিন Button */
.dpb .serial-booking-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 18px;
  background: linear-gradient(135deg, #0d9488, #0f766e);
  color: #ffffff !important;
  font-size: 13px;
  font-weight: 700;
  font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif;
  text-decoration: none;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
  letter-spacing: 0.3px;
  width: fit-content;
  max-width: 100%;
}
.dpb .serial-booking-button:hover {
  background: linear-gradient(135deg, #0f766e, #115e59);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
}
.dpb .serial-booking-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(13, 148, 136, 0.25);
}
.dpb .serial-booking-button:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .dpb .serial-booking-button {
    width: 100%;
    padding: 10px 18px;
    font-size: 13.5px;
  }
}

.dpb .poster-footer{display:flex;align-items:center;justify-content:space-between;background:#eef4fb;padding:16px 22px;flex-wrap:wrap;gap:14px;border-top:3px solid #1c5fa8;}
.dpb .footer-col{display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:#333;}
.dpb .footer-line{display:flex;align-items:center;gap:6px;white-space:pre-line;font-size:16px;}
.dpb .footer-center{align-items:center;text-align:center;}
.dpb .hospital-name{font-size:19px;font-weight:800;color:#1c5fa8;letter-spacing:0.5px;}
.dpb .hospital-subtitle{font-size:20.5px;color:#555;font-weight:600;letter-spacing:0.5px;}
.dpb .footer-right{align-items:flex-end;text-align:right;}
.dpb .footer-contact-label{font-weight:700;color:#1c5fa8;font-size:16px;}
.dpb .footer-phone{display:flex;align-items:center;gap:6px;font-weight:700;font-size:20px;}

.dpb .doctor-entry,.dpb .doctor-row,.dpb .doctor-name,.dpb .doctor-quals,.dpb .doctor-specialty,.dpb .doctor-workplace,.dpb .doctor-time-slots,.dpb .doctor-row-name,.dpb .doctor-row-specialty{text-align:left !important;}

/* ✅ Doctor Link Modal */
.dpb .link-modal-input{display:flex;gap:8px;align-items:center;background:#f8fafc;border:1.5px solid #e2e6ee;border-radius:10px;padding:8px 12px;font-size:13px;}
.dpb .link-modal-input input{flex:1;border:none;background:transparent;outline:none;font-family:monospace;font-size:13px;color:#1e293b;padding:6px 0;}
.dpb .qr-container{text-align:center;padding:20px;background:#f8fafc;border-radius:12px;border:1px dashed #cbd5e1;margin-top:16px;}
.dpb .qr-container canvas,.dpb .qr-container img{max-width:220px;height:auto;border-radius:8px;}

/* ✅ Doctor Image Upload Styles */
.dpb .doctor-image-upload{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.dpb .doctor-image-preview{width:90px;height:90px;border-radius:50%;border:2px solid #e2e6ee;overflow:hidden;background:#f8fafc;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;}
.dpb .doctor-image-preview img{width:100%;height:100%;object-fit:cover;}
.dpb .doctor-image-preview .placeholder{color:#cbd5e1;}
.dpb .doctor-thumb{width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#f1f5f9;border:2px solid #e2e6ee;display:flex;align-items:center;justify-content:center;}
.dpb .doctor-thumb img{width:100%;height:100%;object-fit:cover;}
.dpb .doctor-thumb .placeholder{color:#94a3b8;}

@media (max-width: 900px) {
  .dpb .topbar { padding: 12px 16px; gap: 10px; flex-wrap: wrap; align-items: center; position: sticky; }
  .dpb .topbar-title { font-size: 16px; gap: 6px; flex: 1; min-width: 0; }
  .dpb .topbar-title svg { width: 20px; height: 20px; }
  .dpb .topbar-right { width: 100%; gap: 10px; flex-wrap: wrap; justify-content: flex-start; }
  .dpb .tabs { background: transparent; padding: 0; gap: 8px; flex-wrap: wrap; flex: 1; width: 100%; overflow: visible; }
  .dpb .tab { padding: 10px 18px; font-size: 14px; font-weight: 600; background: #f1f5f9; border: none; border-radius: 12px; white-space: nowrap; flex-shrink: 0; color: #64748b; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .dpb .tab:hover { background: #e2e8f0; color: #334155; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  .dpb .tab.active { background: #1c5fa8; color: #ffffff; box-shadow: 0 4px 12px rgba(28,95,168,0.35); }
  .dpb .tab.booking-tab { background: linear-gradient(45deg, #0d9488, #14b8a6); color: #ffffff; border: none; padding: 10px 18px; font-size: 14px; border-radius: 12px; box-shadow: 0 4px 12px rgba(13,148,136,0.35); }
  .dpb .tab.booking-tab.active { background: linear-gradient(45deg, #0f766e, #14b8a6); box-shadow: 0 6px 16px rgba(13,148,136,0.55); }
  .dpb .tab.booking-tab svg { width: 15px; height: 15px; }
  .dpb .logout-btn { padding: 10px 16px; font-size: 13px; gap: 5px; flex-shrink: 0; border-radius: 12px; }
  .dpb .logout-btn svg { width: 14px; height: 14px; }
  .dpb .panel-switcher { padding: 10px 16px; position: relative; top: auto; gap: 8px; flex-wrap: wrap; }
  .dpb .panel-switcher-scroll { flex-wrap: wrap; gap: 8px; }
  .dpb .panel-pill { font-size: 13px; padding: 6px 12px; flex-shrink: 0; }
  .dpb .panel-pill-label { font-size: 13px; }
  .dpb .panel-pill-icon { font-size: 11px; padding: 2px 5px; }
  .dpb .panel-add-btn { padding: 8px 12px; font-size: 12.5px; }
}

@media (max-width: 640px) {
  .dpb .topbar { padding: 12px 14px; gap: 10px; }
  .dpb .topbar-title { font-size: 15px; gap: 6px; }
  .dpb .topbar-title svg { width: 18px; height: 18px; }
  .dpb .topbar-right { gap: 8px; }
  .dpb .tabs { gap: 6px; padding: 0; }
  .dpb .tab { padding: 9px 14px; font-size: 13px; border-radius: 12px; }
  .dpb .tab.booking-tab { padding: 9px 14px; font-size: 13px; }
  .dpb .tab.booking-tab svg { width: 14px; height: 14px; }
  .dpb .logout-btn { padding: 9px 14px; font-size: 12.5px; border-radius: 12px; }
  .dpb .logout-btn svg { width: 13px; height: 13px; }
  .dpb .panel-switcher { padding: 8px 14px; gap: 6px; }
  .dpb .panel-pill { font-size: 12px; padding: 5px 10px; }
  .dpb .panel-pill-label { font-size: 12px; }
  .dpb .panel-pill-icon { font-size: 10px; padding: 1px 4px; }
  .dpb .panel-add-btn { padding: 7px 10px; font-size: 12px; }
  .dpb .edit-panel { padding: 12px; gap: 12px; }
  .dpb .panel-section { padding: 14px; }
  .dpb .preview-wrap { padding: 10px; }
  .dpb .preview-toolbar { gap: 6px; }
  .dpb .preview-toolbar .btn { padding: 8px 12px; font-size: 12px; }
}

@media (max-width: 420px) {
  .dpb .topbar { padding: 10px 12px; gap: 8px; }
  .dpb .topbar-title { font-size: 14px; }
  .dpb .tab { padding: 8px 12px; font-size: 12px; border-radius: 12px; }
  .dpb .tab.booking-tab { padding: 8px 12px; font-size: 12px; }
  .dpb .logout-btn { padding: 8px 12px; font-size: 12px; }
  .dpb .panel-pill { font-size: 11px; padding: 4px 9px; }
  .dpb .panel-pill-label { font-size: 11px; }
  .dpb .edit-panel { padding: 10px; gap: 10px; }
  .dpb .panel-section { padding: 12px; }
}

@media print {
  .no-print { display: none !important; }
  .serial-booking-button { display: none !important; }
  .dpb { background: #fff; }
  .dpb .preview-wrap { max-width: 100%; padding: 0; margin: 0; }
  .dpb .poster-page { box-shadow: none; border: none; border-radius: 0; }
  .dpb .poster-body { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; }
  .dpb * { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
}
@page { margin: 10mm; }

body.generating-poster .dpb .serial-booking-button {
  display: none !important;
}
`;

function SaveIndicator({ status }) {
  if (status === 'idle') return null;
  const text = status === 'saving' ? 'সংরক্ষণ হচ্ছে...' : status === 'saved' ? '✓ সংরক্ষিত হয়েছে' : 'সংরক্ষণ ব্যর্থ হয়েছে';
  return <span className="save-indicator">{text}</span>;
}

function AdminPanel({ users, onApprove, onSetRole, onDeleteUser }) {
  return (
    <div className="edit-panel content-fade-in" style={{ padding: '20px' }}>
      <section className="panel-section">
        <div className="section-header"><label>ইউজার ম্যানেজমেন্ট</label></div>
        <div className="section-hint">রেজিস্ট্রেশন করা ইউজারদের এপ্রুভ, রোল সেট ও ডিলিট করুন।</div>
        {users.length === 0 ? (
          <div className="empty-state">এখনো কোনো ইউজার রেজিস্ট্রেশন করে নি।</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e6ee', textAlign: 'left', color: '#6b7280', fontSize: '14px' }}>
                <th style={{ padding: '10px' }}>নাম</th><th style={{ padding: '10px' }}>ডেসিগনেশন</th><th style={{ padding: '10px' }}>রোল</th><th style={{ padding: '10px' }}>স্ট্যাটাস</th><th style={{ padding: '10px' }}>অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #eef1f7', fontSize: '14px' }}>
                  <td style={{ padding: '10px', fontWeight: '600' }}>{u.name}</td>
                  <td style={{ padding: '10px' }}>{u.designation}</td>
                  <td style={{ padding: '10px' }}>
                    <select value={u.role} onChange={(e) => onSetRole(u.id, e.target.value)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e6ee' }}>
                      <option value="pending">পেন্ডিং</option>
                      <option value="admin">অ্যাডমিন</option>
                      <option value="sub-admin">সাব-অ্যাডমিন</option>
                      <option value="editor">এডিটর</option>
                      <option value="moderator">মডারেটর</option>
                      <option value="viewer">ভিউয়ার</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px' }}>{u.approved ? <span style={{ color: '#2f9e52', fontWeight: '700' }}>এপ্রুভড</span> : <span style={{ color: '#dc2626', fontWeight: '700' }}>পেন্ডিং</span>}</td>
                  <td style={{ padding: '10px', display: 'flex', gap: '8px' }}>
                    {!u.approved && (<button className="btn btn-primary btn-sm" onClick={() => onApprove(u.id)} style={{ padding: '6px 10px', fontSize: '12px' }}><CheckCircle size={14} /> এপ্রুভ</button>)}
                    <button className="btn btn-danger btn-sm" onClick={() => onDeleteUser(u.id)} style={{ padding: '6px 10px', fontSize: '12px' }}><Trash2 size={14} /> ডিলিট</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ==================================================
// ✅ Doctor Link Modal — with UTM-tagged QR
// ==================================================
function DoctorLinkModal({ doctor, onClose }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [linkMode, setLinkMode] = useState('qr'); // 'qr' | 'direct'

  // ✅ Mode অনুযায়ী URL তৈরি
  const linkUrl = buildBookingUrl(
    doctor.id,
    doctor.nameEn || doctor.name || '',
    linkMode === 'qr' ? 'qr' : 'direct'
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!linkUrl) return;
    QRCode.toDataURL(linkUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#1c5fa8', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR error:', err));
  }, [linkUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const input = document.createElement('input');
      input.value = linkUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `qr-${doctor.nameEn || doctor.name || 'doctor'}-${linkMode}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LinkIcon size={18} color="#0891b2" />
            ডাক্তারের বুকিং লিংক
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ width: '90px', height: '90px', borderRadius: '50%', overflow: 'hidden', margin: '0 auto 12px', border: '3px solid #e2e6ee', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {doctor.imageUrl ? (
                <img src={doctor.imageUrl} alt={doctor.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={40} color="#94a3b8" />
              )}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#1c5fa8', marginBottom: '4px' }}>
              {doctor.name}
            </div>
            {doctor.nameEn && (
              <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                {doctor.nameEn}
              </div>
            )}
            {doctor.specialty && (
              <div style={{ fontSize: '13px', color: '#9c2a7e', marginTop: '4px', fontWeight: '600' }}>
                {doctor.specialty}
              </div>
            )}
          </div>

          {/* ✅ Mode Switcher — QR vs Direct Link */}
          <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={() => setLinkMode('qr')}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                borderRadius: '8px',
                background: linkMode === 'qr' ? '#1c5fa8' : 'transparent',
                color: linkMode === 'qr' ? '#fff' : '#475569',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              📱 QR Code (Offline)
            </button>
            <button
              type="button"
              onClick={() => setLinkMode('direct')}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                borderRadius: '8px',
                background: linkMode === 'direct' ? '#1c5fa8' : 'transparent',
                color: linkMode === 'direct' ? '#fff' : '#475569',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              🔗 Direct Link (Online)
            </button>
          </div>

          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
            📎 বুকিং লিংক {linkMode === 'qr' ? '(QR Scan-এর জন্য)' : '(Direct Share-এর জন্য)'}
          </label>
          <div className="link-modal-input">
            <input type="text" readOnly value={linkUrl} onClick={(e) => e.target.select()} />
            <button onClick={handleCopy} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px', flexShrink: 0 }}>
              {copied ? <><Check size={14} /> কপি হয়েছে</> : <><Copy size={14} /> কপি</>}
            </button>
          </div>

          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '10px', lineHeight: '1.6', background: '#f0fdfa', padding: '10px 12px', borderRadius: '8px', border: '1px solid #99f6e4' }}>
            {linkMode === 'qr' ? (
              <>
                <strong style={{ color: '#0f766e' }}>📱 QR Code Mode:</strong> এই লিংকটি QR code-এ embed করা হবে।
                রোগী QR scan করলে GA4-তে <code style={{ background: '#ccfbf1', padding: '1px 5px', borderRadius: '3px' }}>qr / offline</code> source হিসেবে track হবে।
              </>
            ) : (
              <>
                <strong style={{ color: '#0f766e' }}>🔗 Direct Link Mode:</strong> এই লিংক Facebook/WhatsApp-এ share করুন।
                GA4-তে <code style={{ background: '#ccfbf1', padding: '1px 5px', borderRadius: '3px' }}>website / web_button</code> source হিসেবে track হবে।
              </>
            )}
          </div>

          {qrDataUrl && linkMode === 'qr' && (
            <div className="qr-container">
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '10px' }}>
                📱 QR কোড (স্ক্যান করে বুক করুন)
              </div>
              <img src={qrDataUrl} alt="QR Code" />
              <div style={{ marginTop: '12px' }}>
                <button className="btn btn-secondary" onClick={handleDownloadQR} style={{ fontSize: '12.5px' }}>
                  ⬇️ QR ডাউনলোড
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>বন্ধ করুন</button>
        </div>
      </div>
    </div>
  );
}

// ==================================================
// ✅ DoctorRow — with thumbnail / placeholder
// ==================================================
function DoctorRow({ doc, index, total, checked, onToggleChecked, onEdit, onDelete, onMoveUp, onMoveDown, onShowLink, allowDelete = true, showCheckbox = true }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (!confirmDelete) return; const t = setTimeout(() => setConfirmDelete(false), 3000); return () => clearTimeout(t); }, [confirmDelete]);
  return (
    <div className="doctor-row" key={doc.id}>
      {showCheckbox && (<input type="checkbox" className="doctor-checkbox" checked={checked} onChange={onToggleChecked} title="প্রিভিউতে দেখাতে টিক দিন" />)}

      <div className="doctor-thumb">
        {doc.imageUrl ? (
          <img src={doc.imageUrl} alt={doc.name} />
        ) : (
          <span className="placeholder"><User size={22} /></span>
        )}
      </div>

      <div className="doctor-row-info">
        <div className="doctor-row-name">{doc.name || 'নামহীন ডাক্তার'}</div>
        {doc.specialty ? <div className="doctor-row-specialty">{doc.specialty}</div> : null}
        {doc.timeSlots && doc.timeSlots.length > 0 && (
          <div className="doctor-row-time-slots">
            {doc.timeSlots.map((slot, idx) => (
              <span key={idx} className="doctor-row-time-slot-item">⏱ {slot.start} - {slot.end}</span>
            ))}
          </div>
        )}
      </div>
      <div className="doctor-row-actions">
        {onMoveUp && <button className="icon-btn" onClick={onMoveUp} disabled={index === 0} title="উপরে সরান"><ChevronUp size={14} /></button>}
        {onMoveDown && <button className="icon-btn" onClick={onMoveDown} disabled={index === total - 1} title="নিচে সরান"><ChevronDown size={14} /></button>}
        {onShowLink && <button className="icon-btn link-btn" onClick={onShowLink} title="বুকিং লিংক দেখান"><LinkIcon size={14} /></button>}
        <button className="icon-btn" onClick={onEdit} title="সম্পাদনা"><Pencil size={14} /></button>
        {allowDelete && (<button className={confirmDelete ? 'icon-btn danger-confirm' : 'icon-btn'} onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))} title="মুছুন">{confirmDelete ? 'নিশ্চিত?' : <Trash2 size={14} />}</button>)}
      </div>
    </div>
  );
}

function DepartmentCard({ dept, index, total, checkedIds, onEdit, onDelete, onMoveUp, onMoveDown, onAddDoctor, onEditDoctor, onDeleteDoctor, onMoveDoctorUp, onMoveDoctorDown, onToggleDoctorChecked, onToggleAllChecked, onShowDoctorLink, allowDeptDelete = true, allowDoctorDelete = true, showCheckbox = true, showSelectAll = true }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (!confirmDelete) return; const t = setTimeout(() => setConfirmDelete(false), 3000); return () => clearTimeout(t); }, [confirmDelete]);
  const Icon = ICONS[dept.icon] || ICONS.Stethoscope;
  const deptDoctorIds = dept.doctors?.map(doc => doc.id) || [];
  const allChecked = deptDoctorIds.length > 0 && deptDoctorIds.every(id => checkedIds.has(id));
  return (
    <div className="dept-card" style={{ borderLeftColor: dept.color }} key={dept.id}>
      <div className="dept-card-header">
        <div className="dept-card-title">
          <span className="dept-card-icon" style={{ background: dept.color }}><Icon size={15} color="#fff" /></span>
          <strong>{dept.name || 'নামহীন বিভাগ'}</strong>
          <span className="dept-doctor-count">{dept.doctors?.length || 0} জন ডাক্তার</span>
          {showSelectAll && dept.doctors?.length > 0 && (<button className="dept-toggle-btn" onClick={onToggleAllChecked}>{allChecked ? 'সব বাদ দিন' : 'সব বাছুন'}</button>)}
        </div>
        <div className="dept-card-actions">
          {onMoveUp && <button className="icon-btn" onClick={onMoveUp} disabled={index === 0} title="উপরে সরান"><ChevronUp size={16} /></button>}
          {onMoveDown && <button className="icon-btn" onClick={onMoveDown} disabled={index === total - 1} title="নিচে সরান"><ChevronDown size={16} /></button>}
          <button className="icon-btn" onClick={onEdit} title="সম্পাদনা"><Pencil size={16} /></button>
          {allowDeptDelete && (<button className={confirmDelete ? 'icon-btn danger-confirm' : 'icon-btn'} onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))} title="মুছুন">{confirmDelete ? 'নিশ্চিত?' : <Trash2 size={16} />}</button>)}
        </div>
      </div>
      <div className="doctor-mini-list">
        {dept.doctors?.map((doc, di) => (
          <DoctorRow key={doc.id} doc={doc} index={di} total={dept.doctors?.length || 0} checked={checkedIds.has(doc.id)}
            onToggleChecked={() => onToggleDoctorChecked(doc.id)} onEdit={() => onEditDoctor(doc)}
            onDelete={() => onDeleteDoctor(doc.id)} onMoveUp={() => onMoveDoctorUp(doc.id)} onMoveDown={() => onMoveDoctorDown(doc.id)}
            onShowLink={onShowDoctorLink ? () => onShowDoctorLink(doc) : null}
            allowDelete={allowDoctorDelete} showCheckbox={showCheckbox} />
        ))}
        {allowDoctorDelete && <button className="add-doctor-btn" onClick={onAddDoctor}><Plus size={14} /> ডাক্তার যোগ করুন</button>}
      </div>
    </div>
  );
}

function DepartmentModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [icon, setIcon] = useState(initial ? initial.icon : 'Stethoscope');
  const [color, setColor] = useState(initial ? initial.color : COLOR_THEMES[0]);
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const handleSave = () => { if (!name.trim()) return; onSave({ name: name.trim(), icon, color }); };
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal-box" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header"><h3>{initial ? 'বিভাগ সম্পাদনা করুন' : 'নতুন বিভাগ যোগ করুন'}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
      <div className="modal-body"><label>বিভাগের নাম</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমনঃ মেডিসিন বিভাগ" /><label>আইকন বেছে নিন</label><div className="icon-grid">{ICON_KEYS.map((key) => { const IconComp = ICONS[key]; const selected = icon === key; return (<button key={key} className={selected ? 'icon-choice selected' : 'icon-choice'} style={selected ? { borderColor: color, background: color } : {}} onClick={() => setIcon(key)} title={key}><IconComp size={17} color={selected ? '#fff' : '#555'} /></button>); })}</div><label>রঙ বেছে নিন</label><div className="color-grid">{COLOR_THEMES.map((c) => (<button key={c} className={color === c ? 'color-choice selected' : 'color-choice'} style={{ background: c }} onClick={() => setColor(c)} title={c} />))}</div></div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>বাতিল</button><button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>সংরক্ষণ করুন</button></div>
    </div></div>
  );
}

function DoctorModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [nameEn, setNameEn] = useState(initial ? initial.nameEn || '' : '');
  const [quals, setQuals] = useState(initial ? initial.quals : '');
  const [specialty, setSpecialty] = useState(initial ? initial.specialty : '');
  const [workplace, setWorkplace] = useState(initial ? initial.workplace : '');
  const [timeSlots, setTimeSlots] = useState(
    initial?.timeSlots && initial.timeSlots.length > 0 ? initial.timeSlots : [{ start: '09:00 AM', end: '11:00 AM' }]
  );
  const [slotErrors, setSlotErrors] = useState({});

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl || '');
  const [imageError, setImageError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAddSlot = () => setTimeSlots([...timeSlots, { start: '09:00 AM', end: '11:00 AM' }]);

  const handleRemoveSlot = (index) => {
    if (timeSlots.length <= 1) { alert('কমপক্ষে একটি সময় স্লট থাকতে হবে!'); return; }
    const newSlots = timeSlots.filter((_, i) => i !== index);
    setTimeSlots(newSlots);
    const newErrors = { ...slotErrors };
    delete newErrors[`${index}-start`];
    delete newErrors[`${index}-end`];
    setSlotErrors(newErrors);
  };

  const handleSlotChange = (index, field, value) => {
    const updated = timeSlots.map((slot, i) => i === index ? { ...slot, [field]: value } : slot);
    setTimeSlots(updated);
    const errorKey = `${index}-${field}`;
    const newErrors = { ...slotErrors };
    if (value.trim() && !validateTimeFormat(value)) newErrors[errorKey] = 'ফরম্যাট: 09:00 AM বা 11:30 PM';
    else delete newErrors[errorKey];
    setSlotErrors(newErrors);
  };

  const handleSlotBlur = (index, field) => {
    const value = timeSlots[index][field];
    if (value.trim() && validateTimeFormat(value)) {
      const standardized = standardizeTime(value);
      const updated = timeSlots.map((slot, i) => i === index ? { ...slot, [field]: standardized } : slot);
      setTimeSlots(updated);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError('');
    if (!file.type.startsWith('image/')) {
      setImageError('শুধু ছবি (image) ফাইল নির্বাচন করুন');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setImageError('ছবির সাইজ 3MB এর কম হতে হবে');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImageError('');
  };

  const handleSave = async () => {
    if (!name.trim()) { alert('ডাক্তারের নাম লিখুন!'); return; }
    const errors = {};
    let hasError = false;
    timeSlots.forEach((slot, i) => {
      if (!slot.start || !slot.start.trim()) { errors[`${i}-start`] = 'শুরুর সময় লিখুন'; hasError = true; }
      else if (!validateTimeFormat(slot.start)) { errors[`${i}-start`] = 'ফরম্যাট: 09:00 AM বা 11:30 PM'; hasError = true; }
      if (!slot.end || !slot.end.trim()) { errors[`${i}-end`] = 'শেষ সময় লিখুন'; hasError = true; }
      else if (!validateTimeFormat(slot.end)) { errors[`${i}-end`] = 'ফরম্যাট: 09:00 AM বা 11:30 PM'; hasError = true; }
      if (slot.start && slot.end && validateTimeFormat(slot.start) && validateTimeFormat(slot.end)) {
        const startMin = timeToMinutes(slot.start);
        const endMin = timeToMinutes(slot.end);
        if (startMin !== null && endMin !== null && startMin >= endMin) {
          errors[`${i}-end`] = 'শেষ সময় অবশ্যই শুরুর সময়ের পরে হতে হবে';
          hasError = true;
        }
      }
    });
    if (hasError) { setSlotErrors(errors); alert('সময় স্লটে ত্রুটি আছে। অনুগ্রহ করে ঠিক করুন।'); return; }
    const cleanedSlots = timeSlots.map((slot) => ({ start: standardizeTime(slot.start), end: standardizeTime(slot.end) }));

    let finalImageUrl = initial?.imageUrl || '';
    try {
      if (imageFile) {
        setUploading(true);
        setImageError('');

        const formData = new FormData();
        formData.append('file', imageFile);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Upload failed');
        }

        finalImageUrl = data.url;
        console.log('✅ Image uploaded:', finalImageUrl);
      } else if (initial?.imageUrl && !imagePreview) {
        finalImageUrl = '';
      }
    } catch (err) {
      console.error('❌ Image upload error:', err);
      setImageError(err.message || 'ছবি আপলোড করতে সমস্যা হয়েছে');
      setUploading(false);
      return;
    } finally {
      setUploading(false);
    }

    onSave({
      name: name.trim(),
      nameEn: nameEn.trim(),
      quals,
      specialty,
      workplace,
      timeSlots: cleanedSlots,
      imageUrl: finalImageUrl,
    });
  };

  const inputBaseStyle = {
    padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
    outline: 'none', width: '100%', textAlign: 'center', fontWeight: '600', letterSpacing: '0.5px', background: '#fff',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? 'ডাক্তারের তথ্য সম্পাদনা' : 'নতুন ডাক্তার যোগ করুন'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">

          <label style={{ fontWeight: '700', display: 'block', marginBottom: '8px' }}>ডাক্তারের ছবি</label>
          <div className="doctor-image-upload" style={{ marginBottom: '16px' }}>
            <div className="doctor-image-preview">
              {imagePreview ? (
                <img src={imagePreview} alt="Doctor preview" />
              ) : (
                <span className="placeholder"><User size={40} /></span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <input
                type="file"
                id="doctor-image-input"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="doctor-image-input"
                className="btn btn-secondary"
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px' }}
              >
                <Camera size={15} /> ছবি নির্বাচন করুন
              </label>
              {imagePreview && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="btn btn-outline"
                  style={{ marginLeft: '8px', fontSize: '12.5px', padding: '8px 14px' }}
                >
                  <X size={14} /> সরান
                </button>
              )}
              <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '6px 0 0 0' }}>
                JPG / PNG · সর্বোচ্চ 3MB · বর্গাকার ছবি সবচেয়ে ভালো
              </p>
              {imageError && (
                <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0 0', fontWeight: '600' }}>
                  ⚠️ {imageError}
                </p>
              )}
            </div>
          </div>

          <label>ডাক্তারের নাম (বাংলা)</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমনঃ ডাঃ মোহাম্মদ নূর" />

          <label style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ডাক্তারের নাম (English)
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(SMS/Email-এ ব্যবহৃত হবে)</span>
          </label>
          <input className="input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="যেমনঃ Dr. Mohammad Nur" />

          <label style={{ marginTop: '12px' }}>শিক্ষাগত যোগ্যতা / ডিগ্রি</label>
          <textarea className="textarea" rows={3} value={quals} onChange={(e) => setQuals(e.target.value)} placeholder="প্রতি লাইনে একটি করে ডিগ্রি লিখুন" />
          <label>বিশেষত্ব</label>
          <textarea className="textarea" rows={2} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="যেমনঃ মেডিসিন বিশেষজ্ঞ" />
          <label>কর্মস্থল / পদবী</label>
          <textarea className="textarea" rows={2} value={workplace} onChange={(e) => setWorkplace(e.target.value)} placeholder="যেমনঃ চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল" />

          <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
            <label style={{ fontWeight: '700', display: 'block', marginBottom: '4px' }}>⏰ সাক্ষাতের সময় (একাধিক স্লট যোগ করুন)</label>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 12px 0', lineHeight: '1.5' }}>
              ফরম্যাট: <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontSize: '11.5px' }}>HH:MM AM</code> অথবা <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontSize: '11.5px' }}>HH:MM PM</code>
              <br />
              উদাহরণ: <strong>09:00 AM</strong>, <strong>02:30 PM</strong>, <strong>11:45 PM</strong>
            </p>

            {timeSlots.map((slot, index) => {
              const startError = slotErrors[`${index}-start`];
              const endError = slotErrors[`${index}-end`];
              return (
                <div key={index} style={{ marginBottom: '12px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: startError || endError ? '1.5px solid #dc2626' : '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>শুরু</label>
                      <input type="text" value={slot.start} onChange={(e) => handleSlotChange(index, 'start', e.target.value)} onBlur={() => handleSlotBlur(index, 'start')} placeholder="09:00 AM" maxLength={8} autoComplete="off" style={{ ...inputBaseStyle, borderColor: startError ? '#dc2626' : '#cbd5e1' }} />
                      {startError && (<div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontWeight: '500' }}>⚠️ {startError}</div>)}
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>শেষ</label>
                      <input type="text" value={slot.end} onChange={(e) => handleSlotChange(index, 'end', e.target.value)} onBlur={() => handleSlotBlur(index, 'end')} placeholder="11:00 AM" maxLength={8} autoComplete="off" style={{ ...inputBaseStyle, borderColor: endError ? '#dc2626' : '#cbd5e1' }} />
                      {endError && (<div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontWeight: '500' }}>⚠️ {endError}</div>)}
                    </div>
                    <div style={{ paddingTop: '22px' }}>
                      <button type="button" onClick={() => handleRemoveSlot(index)} title="স্লট মুছুন" style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '10px', padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(220,38,38,0.20)', transition: 'all 0.2s' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <button className="btn btn-secondary" onClick={handleAddSlot} style={{ marginTop: '6px' }}><Plus size={14} /> আরও সময় যোগ করুন</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>বাতিল</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || uploading}>
            {uploading ? <><Loader2 size={14} className="spin" /> আপলোড হচ্ছে...</> : 'সংরক্ষণ করুন'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelModal({ mode, initial, activeDeptCount, departments, onSave, onClose }) {
  const [name, setName] = useState(initial ? initial.name : '');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [duplicate, setDuplicate] = useState(mode === 'add' && activeDeptCount > 0);
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const handleSave = () => { const trimmed = name.trim(); if (!trimmed) return; onSave({ name: trimmed, title: titleForName(trimmed), duplicate, selectedIds: [...selectedIds] }); };
  const toggleDoctor = (id) => { setSelectedIds(prev => { const newSet = new Set(prev); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); return newSet; }); };
  const toggleAll = () => { const allIds = []; departments.forEach(dept => dept.doctors?.forEach(doc => allIds.push(doc.id))); if (selectedIds.size === allIds.length) setSelectedIds(new Set()); else setSelectedIds(new Set(allIds)); };
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
      <div className="modal-header"><h3>{mode === 'add' ? 'নতুন দিন/প্যানেল যোগ করুন' : 'প্যানেল সম্পাদনা করুন'}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
      <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <label>দিন বা প্যানেলের নাম</label>
        {mode === 'add' ? (<div className="day-buttons">{DAY_NAMES.map((d) => (<button key={d} className="day-btn" onClick={() => setName(d)}>{d}</button>))}</div>) : null}
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমনঃ শনিবার, অথবা নিজের মতো নাম" />
        {mode === 'add' && (<>
          <label style={{ marginTop: '14px', display: 'block' }}>ডাক্তার বেছে নিন (টিক দিন)</label>
          <button className="btn btn-secondary" onClick={toggleAll} style={{ marginBottom: '10px' }}>{selectedIds.size === departments.flatMap(d => d.doctors || []).length ? 'সব বাদ দিন' : 'সব বাছুন'}</button>
          {departments.map(dept => (
            <div key={dept.id} style={{ marginBottom: '10px' }}>
              <strong style={{ color: dept.color }}>{dept.name}</strong>
              {dept.doctors?.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                  <input type="checkbox" checked={selectedIds.has(doc.id)} onChange={() => toggleDoctor(doc.id)} />
                  <label>{doc.name}</label>
                </div>
              ))}
            </div>
          ))}
          <label className="checkbox-row" style={{ marginTop: '14px' }}><input type="checkbox" checked={duplicate} onChange={(e) => setDuplicate(e.target.checked)} /><span>বর্তমান দিনের ডাক্তার সিলেকশন কপি করুন</span></label>
        </>)}
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>বাতিল</button><button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>সংরক্ষণ করুন</button></div>
    </div></div>
  );
}

function PanelSwitcher({ panels, activePanelId, onSwitch, onAdd, onRename, onDelete, isReadOnly = false }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  useEffect(() => { if (!confirmDeleteId) return; const t = setTimeout(() => setConfirmDeleteId(null), 3000); return () => clearTimeout(t); }, [confirmDeleteId]);
  return (
    <div className="panel-switcher no-print">
      <div className="panel-switcher-scroll">
        {panels.map((p) => { const active = p.id === activePanelId; return (
          <div key={p.id} className={active ? 'panel-pill active' : 'panel-pill'}>
            <button className="panel-pill-label" onClick={() => onSwitch(p.id)}>{p.name || 'নামহীন'}</button>
            {!isReadOnly && <button className="panel-pill-icon" onClick={() => onRename(p)} title="এডিট করুন" style={{ color: active ? '#fff' : '#1c5fa8', fontWeight: 'bold' }}><Pencil size={12} /> এডিট</button>}
            {!isReadOnly && panels.length > 1 ? (<button className={confirmDeleteId === p.id ? 'panel-pill-icon danger-confirm' : 'panel-pill-icon'} onClick={() => (confirmDeleteId === p.id ? onDelete(p.id) : setConfirmDeleteId(p.id))} title="মুছুন">{confirmDeleteId === p.id ? '✓' : <X size={11} />}</button>) : null}
          </div>
        ); })}
      </div>
      {!isReadOnly && <button className="btn btn-secondary panel-add-btn" onClick={onAdd}><Plus size={14} /> নতুন দিন</button>}
    </div>
  );
}

function EditPanel({ panel, departments, footer, checkedIds, allChecked, onUpdateTitle, onUpdateFooter, onUpdatePhone, onAddPhone, onRemovePhone, onAddDept, onEditDept, onDeleteDept, onMoveDept, onAddDoctor, onEditDoctor, onDeleteDoctor, onMoveDoctor, onToggleDoctorChecked, onToggleDeptAllChecked, onToggleAll, clearConfirm, onClearAll, onGoPreview, onShowDoctorLink }) {

  const orderedDepartments = getOrderedDepartments(departments, panel?.departmentOrder);

  return (
    <div className="edit-panel">
      <section className="panel-section">
        <div className="section-header"><label>এই দিনের শিরোনাম</label><button className="toggle-all-btn" onClick={onToggleAll}>{allChecked ? 'সব বাদ দিন' : 'সব বাছুন'}</button></div>
        <p className="section-hint">উপরে দিনের ট্যাব থেকে অন্য দিনে যেতে পারবেন, অথবা এখানে "{panel?.name || 'প্যানেল'}"-এর শিরোনাম বদলান</p>
        <input className="input" value={panel.title} onChange={(e) => onUpdateTitle(e.target.value)} placeholder="যেমনঃ শনিবারের ডক্টরস প্যানেল" />
      </section>
      <section className="panel-section">
        <div className="section-header"><label>বিভাগ ও ডাক্তার তালিকা — {panel.name}</label><button className="btn btn-primary" onClick={onAddDept}><Plus size={15} /> নতুন বিভাগ</button></div>
        <p className="section-hint">প্রতিটি ডাক্তারের পাশের বক্সে টিক দিয়ে বেছে নিন কারা "{panel.name}"-এর পোস্টারে দেখাবে। 🔗 আইকনে ক্লিক করে বুকিং লিংক দেখুন। ⬆️⬇️ দিয়ে এই দিনের জন্য বিভাগের ক্রম ঠিক করুন — অন্য দিনের ক্রম অপরিবর্তিত থাকবে।</p>
        {departments.length === 0 ? (<div className="empty-state">এখনো কোনো বিভাগ যোগ করা হয়নি।</div>) : null}
        {orderedDepartments.map((dept, i) => (
          <DepartmentCard key={dept.id} dept={dept} index={i} total={orderedDepartments.length} checkedIds={checkedIds}
            onEdit={() => onEditDept(dept)} onDelete={() => onDeleteDept(dept.id)}
            onMoveUp={() => onMoveDept(dept.id, -1)} onMoveDown={() => onMoveDept(dept.id, 1)}
            onAddDoctor={() => onAddDoctor(dept.id)} onEditDoctor={(doc) => onEditDoctor(dept.id, doc)}
            onDeleteDoctor={(docId) => onDeleteDoctor(dept.id, docId)}
            onMoveDoctorUp={(docId) => onMoveDoctor(dept.id, docId, -1)} onMoveDoctorDown={(docId) => onMoveDoctor(dept.id, docId, 1)}
            onToggleDoctorChecked={onToggleDoctorChecked} onToggleAllChecked={() => onToggleDeptAllChecked(dept.id)}
            onShowDoctorLink={onShowDoctorLink}
            allowDeptDelete={false} allowDoctorDelete={false} />
        ))}
      </section>
      <section className="panel-section">
        <label>ফুটার তথ্য</label>
        <div className="footer-form-grid">
          <div className="field"><label>হাসপাতালের নাম</label><input className="input" value={footer.hospitalName} onChange={(e) => onUpdateFooter({ hospitalName: e.target.value })} /></div>
          <div className="field"><label>সাবটাইটেল</label><input className="input" value={footer.hospitalSubtitle} onChange={(e) => onUpdateFooter({ hospitalSubtitle: e.target.value })} /></div>
          <div className="field"><label>ঠিকানা</label><textarea className="textarea" rows={2} value={footer.address} onChange={(e) => onUpdateFooter({ address: e.target.value })} /></div>
          <div className="field"><label>ওয়েবসাইট</label><input className="input" value={footer.website} onChange={(e) => onUpdateFooter({ website: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>যোগাযোগ লেবেল</label><input className="input" value={footer.contactLabel} onChange={(e) => onUpdateFooter({ contactLabel: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>ফোন নম্বর</label>
            {footer.phones.map((p, i) => (<div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}><input className="input" value={p} onChange={(e) => onUpdatePhone(i, e.target.value)} placeholder="০১৮৮৬ ৭৭৬ ৫১২" /><button className="icon-btn" onClick={() => onRemovePhone(i)}><Trash2 size={15} /></button></div>))}
            <button className="btn btn-secondary" onClick={onAddPhone}><Plus size={14} /> নম্বর যোগ করুন</button>
          </div>
        </div>
      </section>
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '30px' }}><button className="btn btn-primary" onClick={onGoPreview} style={{ padding: '12px 28px', fontSize: '14px' }}>প্রিভিউ দেখুন →</button></div>
    </div>
  );
}

function DeptHeader({ dept }) { const Icon = ICONS[dept.icon] || ICONS.Stethoscope; return (<div className="dept-header-wrap"><span className="dept-icon-box" style={{ borderColor: dept.color }}><Icon size={19} color={dept.color} /></span><div className="dept-ribbon" style={{ background: dept.color }}><span>{dept.name}</span></div></div>); }

// ==================================================
// ✅ DoctorEntry — with UTM-tagged booking button
// ==================================================
function DoctorEntry({ doc, accentColor }) {
  const hasValidId = doc.id && typeof doc.id === 'string' && doc.id.trim() !== '';

  // ✅ screen-এর ভেতরে click থেকে আসা রোগী (utm_source=website)
  const bookingUrl = hasValidId
    ? buildBookingUrl(doc.id, doc.nameEn || doc.name || '', 'direct')
    : null;

  return (
    <div className="doctor-entry" style={{ borderLeftColor: accentColor }}>
      <div className="doctor-name">{doc.name}</div>
      {doc.quals ? <div className="doctor-quals">{doc.quals}</div> : null}
      {doc.specialty ? <div className="doctor-specialty">{doc.specialty}</div> : null}
      {doc.workplace ? <div className="doctor-workplace">{doc.workplace}</div> : null}
      {doc.timeSlots && doc.timeSlots.length > 0 && (
        <div className="doctor-time-slots">
          {doc.timeSlots.map((slot, idx) => (
            <span key={idx} className="doctor-time-slot-item">
              <span className="doctor-time-label">⏱ সাক্ষাতের সময়ঃ</span>
              {' '}{slot.start} - {slot.end}
            </span>
          ))}
        </div>
      )}

      {hasValidId && (
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="serial-booking-button"
          aria-label={`${doc.name} এর সিরিয়াল নিন`}
          onClick={() => {
            trackEvent('booking_button_click', {
              doctor_id: doc.id,
              doctor_name: doc.name,
              department: doc.deptName || 'unknown',
              source: 'website_button',
            });
          }}
        >
          সিরিয়াল নিন
        </a>
      )}
    </div>
  );
}

function PreviewPanel({ panel, departments, checkedIds, footer, onBack, user }) {
  const printRef = useRef(null);
  const isAdmin = user?.role === 'admin';

  const handlePrint = () => {
    if (!isAdmin) { alert('❌ শুধুমাত্র অ্যাডমিন প্রিন্ট করতে পারবেন।'); return; }
    window.print();
  };

  const downloadPNG = async () => {
    if (!isAdmin) { alert('❌ শুধুমাত্র অ্যাডমিন PNG ডাউনলোড করতে পারবেন।'); return; }
    const element = printRef.current;
    if (!element) return;
    try {
      document.body.classList.add('generating-poster');

      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ignoreElements: html2canvasIgnoreElements,
      });

      const link = document.createElement('a');
      link.download = `${panel?.title || 'poster'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('PNG download error:', error);
      alert('PNG ডাউনলোড করতে সমস্যা হয়েছে।');
    } finally {
      document.body.classList.remove('generating-poster');
    }
  };

  const downloadPDF = async () => {
    if (!isAdmin) { alert('❌ শুধুমাত্র অ্যাডমিন PDF ডাউনলোড করতে পারবেন।'); return; }
    const element = printRef.current;
    if (!element) return;
    try {
      document.body.classList.add('generating-poster');

      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ignoreElements: html2canvasIgnoreElements,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfPageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfPageHeight;
      }
      pdf.save(`${panel?.title || 'poster'}.pdf`);
    } catch (error) {
      console.error('PDF download error:', error);
      alert('PDF ডাউনলোড করতে সমস্যা হয়েছে।');
    } finally {
      document.body.classList.remove('generating-poster');
    }
  };

  const hasChecked = checkedIds && checkedIds.size > 0;

  const orderedDepartments = getOrderedDepartments(departments, panel?.departmentOrder);

  const visibleDepartments = orderedDepartments.map((dept) => ({
    ...dept,
    doctors: dept.doctors?.filter((doc) => hasChecked ? checkedIds.has(doc.id) : true) || []
  })).filter((dept) => dept.doctors.length > 0);

  return (
    <div className="preview-wrap">
      {isAdmin && (
        <div className="preview-toolbar no-print">
          {onBack && (<button className="btn btn-outline" onClick={onBack} style={{ marginRight: 'auto' }}><ChevronLeft size={16} /> ব্যাক টু এডিট</button>)}
          <button className="btn btn-primary" onClick={handlePrint}><Printer size={16} /> প্রিন্ট</button>
          <button className="btn btn-secondary" onClick={downloadPNG}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> PNG</button>
          <button className="btn btn-secondary" onClick={downloadPDF}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF</button>
        </div>
      )}

      <div id="dpb-print-area" className="poster-page" ref={printRef}>
        <div className="poster-header"><h1>{panel?.title || panel?.name || 'ডক্টরস প্যানেল'}</h1></div>
        {visibleDepartments.length === 0 ? (
          <div className="poster-empty-note" style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>
            {panel?.name || 'এই প্যানেলে'} এর জন্য কোনো ডাক্তার নির্বাচন করা হয়নি।
          </div>
        ) : (
          <div className="poster-body">
            {visibleDepartments.map((dept) => (
              <div className="dept-block" key={dept.id}>
                <DeptHeader dept={dept} />
                {dept.doctors.map((doc) => <DoctorEntry key={doc.id} doc={doc} accentColor={dept.color} />)}
              </div>
            ))}
          </div>
        )}
        <div className="poster-footer">
          <div className="footer-col footer-left">
            <div className="footer-line"><MapPin size={20} /> <span>{footer.address}</span></div>
            <div className="footer-line"><Globe size={20} /> <span>{footer.website}</span></div>
          </div>
          <div className="footer-col footer-center">
            <img src={footer.logo} alt="Logo" style={{ height: '170px', width: 'auto', objectFit: 'contain' }} />
            <div className="hospital-subtitle">{footer.hospitalSubtitle}</div>
          </div>
          <div className="footer-col footer-right">
            <div className="footer-contact-label">{footer.contactLabel}</div>
            {footer.phones.map((p, i) => <div className="footer-phone" key={i}><Phone size={22} /> {p}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ManageDoctorsView({ departments, onAddDept, onEditDept, onDeleteDept, onMoveDept, onAddDoctor, onEditDoctor, onDeleteDoctor, onMoveDoctor, isAdmin, onRefreshData, onShowDoctorLink }) {
  return (
    <div className="edit-panel">
      <section className="panel-section">
        <div className="section-header">
          <label>মাস্টার ডাক্তার তালিকা (শুধুমাত্র অ্যাডমিনের জন্য)</label>
          <button className="btn btn-secondary" onClick={onRefreshData}><RefreshCw size={14} /> ডেটা রিফ্রেশ করুন</button>
          {isAdmin && <button className="btn btn-primary" onClick={onAddDept}><Plus size={15} /> নতুন বিভাগ</button>}
        </div>
        <p className="section-hint">ডেটা না দেখালে "ডেটা রিফ্রেশ করুন" বাটনে ক্লিক করুন। 🔗 আইকনে ক্লিক করে ডাক্তারের বুকিং লিংক কপি করুন। 📷 এডিট থেকে ডাক্তারের ছবি যোগ করুন।</p>
        {departments.length === 0 ? (<div className="empty-state">এখনো কোনো বিভাগ যোগ করা হয়নি বা ডেটা লোড করা যায়নি।</div>) : null}
        {departments.map((dept, i) => (
          <DepartmentCard key={dept.id} dept={dept} index={i} total={departments.length} checkedIds={new Set()}
            onEdit={() => onEditDept(dept)} onDelete={() => onDeleteDept(dept.id)}
            onMoveUp={() => onMoveDept(dept.id, -1)} onMoveDown={() => onMoveDept(dept.id, 1)}
            onAddDoctor={() => onAddDoctor(dept.id)} onEditDoctor={(doc) => onEditDoctor(dept.id, doc)}
            onDeleteDoctor={(docId) => onDeleteDoctor(dept.id, docId)}
            onMoveDoctorUp={(docId) => onMoveDoctor(dept.id, docId, -1)} onMoveDoctorDown={(docId) => onMoveDoctor(dept.id, docId, 1)}
            onToggleDoctorChecked={() => {}} onToggleAllChecked={() => {}}
            onShowDoctorLink={onShowDoctorLink}
            allowDeptDelete={isAdmin} allowDoctorDelete={isAdmin}
            showCheckbox={false} showSelectAll={false} />
        ))}
      </section>
    </div>
  );
}

export default function DoctorPanelBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentHospital } = useHospital();
  const hospitalId = currentHospital?.id || 'alafiyah_main';
  const { user, logout } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isSubAdmin = user?.role === 'sub-admin';
  const isEditor = user?.role === 'editor';
  const isModerator = user?.role === 'moderator';
  const isViewer = user?.role === 'viewer';
  const isGuest = !user;

  const path = location.pathname;

  const bookingDoctorMatch = path.match(/^\/booking\/(.+)$/);
  const bookingDoctorId = bookingDoctorMatch ? bookingDoctorMatch[1] : null;

  let activeView;
  if (path === '/') {
    activeView = 'preview';
  } else if (bookingDoctorId) {
    activeView = 'booking';
  } else {
    activeView = path.substring(1);
  }

  const setActiveView = (view) => {
    if (view === 'preview') navigate('/');
    else navigate(`/${view}`);
  };

  const [showAuth, setShowAuth] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [panels, setPanels] = useState([]);
  const [activePanelId, setActivePanelId] = useState(null);
  const [footer, setFooter] = useState(DEFAULT_FOOTER);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [deptModal, setDeptModal] = useState(null);
  const [doctorModal, setDoctorModal] = useState(null);
  const [panelModal, setPanelModal] = useState(null);
  const [linkModalDoctor, setLinkModalDoctor] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const debounceRef = useRef(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleLogout = () => { logout(); setTimeout(() => window.location.reload(), 100); };

  useEffect(() => {
    const loadData = async () => {
      const hid = hospitalId || 'alafiyah_main';
      setLoading(true);
      try {
        const deptSnapshot = await getDocs(collection(db, 'hospitals', hid, 'departments'));
        const depts = deptSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setDepartments(depts);

        const panelSnapshot = await getDocs(collection(db, 'hospitals', hid, 'panels'));
        let panelList = panelSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        panelList.sort((a, b) => {
          const ai = DAY_NAMES.indexOf(a.name);
          const bi = DAY_NAMES.indexOf(b.name);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        const defaultDeptOrder = depts.map(d => d.id);

        const panelsNeedingMigration = panelList.filter(
          p => !p.departmentOrder || p.departmentOrder.length === 0
        );
        if (panelsNeedingMigration.length > 0) {
          await Promise.all(
            panelsNeedingMigration.map(p =>
              setDoc(
                doc(db, 'hospitals', hid, 'panels', p.id),
                { ...p, departmentOrder: defaultDeptOrder },
                { merge: true }
              ).catch(err => console.warn('Migration failed for panel', p.id, err))
            )
          );
        }

        panelList = panelList.map(p => ({
          ...p,
          departmentOrder: (p.departmentOrder && p.departmentOrder.length > 0)
            ? p.departmentOrder
            : defaultDeptOrder,
        }));

        if (panelList.length === 0) {
          const defaultPanel = {
            id: 'শনিবার',
            name: 'শনিবার',
            title: 'শনিবারের ডক্টরস প্যানেল',
            activeDoctorIds: [],
            departmentOrder: defaultDeptOrder,
          };
          await setDoc(doc(db, 'hospitals', hid, 'panels', 'শনিবার'), defaultPanel);
          panelList = [defaultPanel];
        }
        setPanels(panelList);

        const footerRef = doc(db, 'hospitals', hid, 'footer', 'data');
        const footerSnap = await getDoc(footerRef);
        if (footerSnap.exists()) setFooter(footerSnap.data());

        const params = new URLSearchParams(window.location.search);
        let targetDay = params.get('day');
        if (!targetDay) {
          const weekDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
          targetDay = weekDays[new Date().getDay()];
        }
        let activePanel = panelList.find(p => p.name === targetDay) || panelList[0];
        if (activePanel) {
          setActivePanelId(activePanel.id);
          setCheckedIds(new Set(activePanel.activeDoctorIds || []));
        }
      } catch (error) {
        console.error('❌ ডেটা লোড ত্রুটি:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [hospitalId, reloadKey]);

  useEffect(() => {
    if (!isAdmin || !hospitalId) { setAllUsers([]); return; }
    const loadUsers = async () => {
      try {
        const usersRef = collection(db, 'hospitals', hospitalId, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const usersList = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, ...data, name: data.name || data.displayName || 'নাম নেই', designation: data.designation || data.role || '' };
        });
        setAllUsers(usersList);
      } catch (error) {
        console.error('❌ ইউজার লোড error:', error);
        setAllUsers([]);
      }
    };
    loadUsers();
  }, [isAdmin, hospitalId]);

  const saveDepartments = async (newDepts) => {
    if (!hospitalId) return;
    try {
      const oldSnapshot = await getDocs(collection(db, 'hospitals', hospitalId, 'departments'));
      const batch = writeBatch(db);
      oldSnapshot.forEach(doc => batch.delete(doc.ref));
      newDepts.forEach((dept, index) => {
        const { id, ...deptData } = dept;
        const ref = doc(db, 'hospitals', hospitalId, 'departments', id || uid());
        batch.set(ref, { ...deptData, order: index });
      });
      await batch.commit();
    } catch (error) { console.error('saveDepartments error:', error); }
  };

  const savePanelToFirebase = async (panel) => {
    if (!hospitalId) return;
    try { await setDoc(doc(db, 'hospitals', hospitalId, 'panels', panel.id), panel); } catch (error) { console.error('savePanel error:', error); }
  };

  const deletePanelFromFirebase = async (panelId) => {
    if (!hospitalId) return;
    try { await deleteDoc(doc(db, 'hospitals', hospitalId, 'panels', panelId)); } catch (error) { console.error('deletePanel error:', error); }
  };

  const saveFooter = async (newFooter) => {
    if (!hospitalId) return;
    try { await setDoc(doc(db, 'hospitals', hospitalId, 'footer', 'data'), newFooter); } catch (error) { console.error('saveFooter error:', error); }
  };

  const activePanel = panels.find(p => p.id === activePanelId) || (panels.length > 0 ? panels[0] : { id: 'empty', name: 'কোনো প্যানেল নেই', title: 'প্যানেল তৈরি করুন', activeDoctorIds: [], departmentOrder: [] });
  const allDoctorIds = departments.flatMap(d => d.doctors?.map(doc => doc.id) || []);
  const allChecked = allDoctorIds.length > 0 && allDoctorIds.every(id => checkedIds.has(id));

  const handleApprove = async (userId) => {
    if (!hospitalId) return;
    try { await updateDoc(doc(db, 'hospitals', hospitalId, 'users', userId), { approved: true }); setAllUsers(users => users.map(u => u.id === userId ? { ...u, approved: true } : u)); } catch (e) { console.error(e); }
  };
  const handleSetRole = async (userId, role) => {
    if (!hospitalId) return;
    try { await updateDoc(doc(db, 'hospitals', hospitalId, 'users', userId), { role }); setAllUsers(users => users.map(u => u.id === userId ? { ...u, role } : u)); } catch (e) { console.error(e); }
  };
  const handleDeleteUser = async (userId) => {
    if (!hospitalId) return;
    try { await deleteDoc(doc(db, 'hospitals', hospitalId, 'users', userId)); setAllUsers(users => users.filter(u => u.id !== userId)); } catch (e) { console.error(e); }
  };

  const updatePanel = (updater, immediate) => {
    const updated = updater(activePanel);
    const newPanels = panels.map(p => p.id === activePanelId ? updated : p);
    setPanels(newPanels);
    if (immediate) {
      setSaveStatus('saving');
      savePanelToFirebase(updated).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'));
      setTimeout(() => setSaveStatus('idle'), 1500);
    } else {
      setSaveStatus('saving');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        savePanelToFirebase(updated).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'));
        setTimeout(() => setSaveStatus('idle'), 1500);
      }, 700);
    }
  };

  const updateDepartments = (updater, immediate) => {
    const newDepts = updater(departments);
    setDepartments(newDepts);
    if (immediate) saveDepartments(newDepts);
    else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveDepartments(newDepts), 700);
    }
  };

  const handleUpdateTitle = (title) => updatePanel(p => ({ ...p, title }), true);
  const handleUpdateFooter = (changes) => { const newFooter = { ...footer, ...changes }; setFooter(newFooter); saveFooter(newFooter); };
  const handleUpdatePhone = (idx, value) => { const phones = [...footer.phones]; phones[idx] = value; handleUpdateFooter({ phones }); };
  const handleAddPhone = () => handleUpdateFooter({ phones: [...footer.phones, ''] });
  const handleRemovePhone = (idx) => handleUpdateFooter({ phones: footer.phones.filter((_, i) => i !== idx) });
  const handleAddDept = () => setDeptModal({ mode: 'add' });
  const handleEditDept = (dept) => setDeptModal({ mode: 'edit', dept });

  const handleSaveDept = (fields) => {
    if (deptModal.mode === 'add') {
      const newDept = makeDepartment(fields);
      updateDepartments(d => [...d, newDept], true);

      const newPanels = panels.map(p => ({
        ...p,
        departmentOrder: [...(p.departmentOrder || []), newDept.id],
      }));
      setPanels(newPanels);
      newPanels.forEach(p => savePanelToFirebase(p));
    } else {
      const deptId = deptModal.dept.id;
      updateDepartments(d => d.map(dept => dept.id === deptId ? { ...dept, ...fields } : dept), true);
    }
    setDeptModal(null);
  };

  const handleDeleteDept = (deptId) => {
    const removedIds = departments.find(d => d.id === deptId)?.doctors?.map(doc => doc.id) || [];
    updateDepartments(d => d.filter(dept => dept.id !== deptId), true);

    const newPanels = panels.map(p => ({
      ...p,
      activeDoctorIds: (p.activeDoctorIds || []).filter(id => !removedIds.includes(id)),
      departmentOrder: (p.departmentOrder || []).filter(id => id !== deptId),
    }));
    setPanels(newPanels);
    newPanels.forEach(p => savePanelToFirebase(p));
  };

  const handleMoveDept = (deptId, dir) => {
    const currentOrder = (activePanel.departmentOrder && activePanel.departmentOrder.length > 0)
      ? [...activePanel.departmentOrder]
      : departments.map(d => d.id);

    const idx = currentOrder.indexOf(deptId);
    if (idx === -1) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= currentOrder.length) return;

    [currentOrder[idx], currentOrder[ni]] = [currentOrder[ni], currentOrder[idx]];

    updatePanel(p => ({ ...p, departmentOrder: currentOrder }), true);
  };

  const handleAddDoctor = (deptId) => setDoctorModal({ deptId, mode: 'add' });
  const handleEditDoctor = (deptId, doctor) => setDoctorModal({ deptId, mode: 'edit', doctor });

  const handleSaveDoctor = (fields) => {
    const deptId = doctorModal.deptId;
    if (doctorModal.mode === 'add') {
      const newDoctor = makeDoctor(fields);
      const updatedDepts = departments.map(dept => dept.id === deptId ? { ...dept, doctors: [...(dept.doctors || []), newDoctor] } : dept);
      setDepartments(updatedDepts);
      saveDepartments(updatedDepts);
      const newPanels = panels.map(p => p.id === activePanelId ? { ...p, activeDoctorIds: [...(p.activeDoctorIds || []), newDoctor.id] } : p);
      setPanels(newPanels);
      newPanels.forEach(p => savePanelToFirebase(p));
      setCheckedIds(prev => new Set([...prev, newDoctor.id]));
    } else {
      const doctorId = doctorModal.doctor.id;
      const updatedDepts = departments.map(dept => dept.id === deptId ? { ...dept, doctors: dept.doctors.map(doc => doc.id === doctorId ? { ...doc, ...fields } : doc) } : dept);
      setDepartments(updatedDepts);
      saveDepartments(updatedDepts);
    }
    setDoctorModal(null);
  };

  const handleDeleteDoctor = (deptId, doctorId) => {
    const updatedDepts = departments.map(dept => dept.id === deptId ? { ...dept, doctors: dept.doctors.filter(doc => doc.id !== doctorId) } : dept);
    setDepartments(updatedDepts);
    saveDepartments(updatedDepts);
    const newPanels = panels.map(p => ({ ...p, activeDoctorIds: (p.activeDoctorIds || []).filter(id => id !== doctorId) }));
    setPanels(newPanels);
    newPanels.forEach(p => savePanelToFirebase(p));
    setCheckedIds(prev => { const newSet = new Set(prev); newSet.delete(doctorId); return newSet; });
  };

  const handleMoveDoctor = (deptId, doctorId, dir) => {
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    const idx = dept.doctors.findIndex(doc => doc.id === doctorId);
    const ni = idx + dir;
    if (ni < 0 || ni >= dept.doctors.length) return;
    const newDepts = departments.map(d => {
      if (d.id !== deptId) return d;
      const newDoctors = [...d.doctors];
      [newDoctors[idx], newDoctors[ni]] = [newDoctors[ni], newDoctors[idx]];
      return { ...d, doctors: newDoctors };
    });
    updateDepartments(() => newDepts, true);
  };
  const handleToggleDoctorChecked = (doctorId) => {
    const newIds = checkedIds.has(doctorId) ? [...checkedIds].filter(id => id !== doctorId) : [...checkedIds, doctorId];
    setCheckedIds(new Set(newIds));
    updatePanel(p => ({ ...p, activeDoctorIds: newIds }), true);
  };
  const handleToggleDeptAllChecked = (deptId) => {
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    const deptIds = dept.doctors.map(doc => doc.id);
    const allCheckedDept = deptIds.every(id => checkedIds.has(id));
    let newIds;
    if (allCheckedDept) newIds = [...checkedIds].filter(id => !deptIds.includes(id));
    else newIds = [...checkedIds].filter(id => !deptIds.includes(id)).concat(deptIds);
    setCheckedIds(new Set(newIds));
    updatePanel(p => ({ ...p, activeDoctorIds: newIds }), true);
  };
  const handleToggleAll = () => {
    let newIds;
    if (allChecked) newIds = [];
    else newIds = allDoctorIds;
    setCheckedIds(new Set(newIds));
    updatePanel(p => ({ ...p, activeDoctorIds: newIds }), true);
  };
  const handleSwitchPanel = (panelId) => {
    const panel = panels.find(p => p.id === panelId);
    if (panel) { setActivePanelId(panelId); setCheckedIds(new Set(panel.activeDoctorIds || [])); }
  };

  const handleAddPanel = async (fields) => {
    const defaultDeptOrder = departments.map(d => d.id);
    const newPanel = {
      id: fields.name,
      name: fields.name,
      title: fields.title,
      activeDoctorIds: fields.duplicate ? [...(activePanel.activeDoctorIds || [])] : (fields.selectedIds || []),
      departmentOrder: fields.duplicate
        ? [...(activePanel.departmentOrder || defaultDeptOrder)]
        : defaultDeptOrder,
    };
    await savePanelToFirebase(newPanel);
    setPanels([...panels, newPanel]);
    setActivePanelId(newPanel.id);
    setCheckedIds(new Set(newPanel.activeDoctorIds));
    setPanelModal(null);
  };

  const handleRenamePanel = (fields) => {
    const panelId = panelModal.panel.id;
    const updated = panels.map(p => p.id === panelId ? { ...p, name: fields.name } : p);
    setPanels(updated);
    savePanelToFirebase(updated.find(p => p.id === panelId));
    setPanelModal(null);
  };
  const handleDeletePanel = async (panelId) => {
    if (panels.length <= 1) return;
    await deletePanelFromFirebase(panelId);
    const remaining = panels.filter(p => p.id !== panelId);
    setPanels(remaining);
    if (activePanelId === panelId) { setActivePanelId(remaining[0].id); setCheckedIds(new Set(remaining[0].activeDoctorIds || [])); }
  };
  const handleSavePanel = (fields) => {
    if (panelModal.mode === 'add') handleAddPanel(fields);
    else handleRenamePanel(fields);
  };
  const handleRefreshData = () => setReloadKey(prev => prev + 1);

  const handleShowDoctorLink = (doctor) => {
    setLinkModalDoctor(doctor);
  };

  const getIsAuthorized = () => {
    if (path === '/' || path === '/booking' || path === '/display' || path === '/preview' || path === '/login') return true;
    if (bookingDoctorId) return true;
    if (path === '/edit' && (isEditor || isModerator || isSubAdmin || isAdmin)) return true;
    if (path === '/doctors' && (isSubAdmin || isAdmin)) return true;
    if (path === '/dashboard' && (isEditor || isModerator || isSubAdmin || isAdmin)) return true;
    if (path === '/admin' && isAdmin) return true;
    return false;
  };

  if (loading) {
    return (
      <>
        <style>{CSS}</style>
        <AppShellSkeleton />
      </>
    );
  }

  if (path === '/login') {
    return (
      <div className="dpb">
        <style>{CSS}</style>
        <AuthPage onClose={() => navigate('/')} />
      </div>
    );
  }

  if (!getIsAuthorized()) return <NotFoundPage />;

  const isDirectBookingView = !!bookingDoctorId;

  return (
    <div className="dpb">
      <style>{CSS}</style>

      {!isDirectBookingView && (
        <div className="topbar no-print">
          <div className="topbar-title"><Stethoscope size={20} /><span>ডাক্তার প্যানেল</span></div>
          <div className="topbar-right">
            <div className="tabs">
              <button className={activeView === 'booking' ? 'tab booking-tab active' : 'tab booking-tab'} onClick={() => setActiveView('booking')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                  <path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>
                  <path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>
                </svg>
                সিরিয়াল নিশ্চিত করুন
              </button>

              <button className={activeView === 'preview' ? 'tab active' : 'tab'} onClick={() => setActiveView('preview')}>
                আজকের ডাক্তার সময়সূচি
              </button>

              {!isGuest && (isEditor || isModerator || isSubAdmin || isAdmin) && (
                <button className={activeView === 'edit' ? 'tab active' : 'tab'} onClick={() => setActiveView('edit')}>
                  প্যানেল বিল্ডার
                </button>
              )}
              {!isGuest && (isSubAdmin || isAdmin) && (
                <button className={activeView === 'doctors' ? 'tab active' : 'tab'} onClick={() => setActiveView('doctors')}>
                  ডাক্তার লিস্ট
                </button>
              )}
              {!isGuest && (isEditor || isModerator || isSubAdmin || isAdmin) && (
                <button className={activeView === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setActiveView('dashboard')}>
                  ড্যাশবোর্ড
                </button>
              )}
              {isAdmin && (
                <button className={activeView === 'admin' ? 'tab active' : 'tab'} onClick={() => setActiveView('admin')}>
                  অ্যাডমিন প্যানেল
                </button>
              )}
            </div>

            <NotificationBell user={user} />

            {!isGuest && (
              <button className="logout-btn" onClick={handleLogout}>
                <LogOut size={14} /> লগআউট
              </button>
            )}
          </div>
        </div>
      )}

      {!isDirectBookingView && (activeView === 'preview' || activeView === 'edit') && (
        <PanelSwitcher
          panels={panels}
          activePanelId={activePanelId}
          onSwitch={handleSwitchPanel}
          onAdd={!isGuest && (isEditor || isModerator || isSubAdmin || isAdmin) ? () => setPanelModal({ mode: 'add', departments }) : () => {}}
          onRename={!isGuest && (isEditor || isModerator || isSubAdmin || isAdmin) ? (panel) => setPanelModal({ mode: 'rename', panel }) : () => {}}
          onDelete={isAdmin ? handleDeletePanel : () => {}}
          isReadOnly={isGuest || isViewer}
        />
      )}

      {activeView === 'booking' && (
        <BookingSystem
          departments={departments}
          panels={panels}
          preselectedDoctorId={bookingDoctorId}
          onBack={() => {
            if (bookingDoctorId) navigate('/');
            else setActiveView('preview');
          }}
        />
      )}
      {activeView === 'preview' && <PreviewPanel panel={activePanel} departments={departments} checkedIds={checkedIds} footer={footer} user={user} />}
      {activeView === 'edit' && !isGuest && (isEditor || isModerator || isSubAdmin || isAdmin) && (
        <EditPanel panel={activePanel} departments={departments} footer={footer} checkedIds={checkedIds} allChecked={allChecked} onUpdateTitle={handleUpdateTitle} onUpdateFooter={handleUpdateFooter} onUpdatePhone={handleUpdatePhone} onAddPhone={handleAddPhone} onRemovePhone={handleRemovePhone} onAddDept={handleAddDept} onEditDept={handleEditDept} onDeleteDept={isAdmin ? handleDeleteDept : () => {}} onMoveDept={handleMoveDept} onAddDoctor={handleAddDoctor} onEditDoctor={handleEditDoctor} onDeleteDoctor={() => {}} onMoveDoctor={handleMoveDoctor} onToggleDoctorChecked={handleToggleDoctorChecked} onToggleDeptAllChecked={handleToggleDeptAllChecked} onToggleAll={handleToggleAll} clearConfirm={clearConfirm} onClearAll={() => {}} onGoPreview={() => setActiveView('preview')} onShowDoctorLink={handleShowDoctorLink} />
      )}
      {activeView === 'doctors' && (isSubAdmin || isAdmin) && (
        <ManageDoctorsView departments={departments} onAddDept={handleAddDept} onEditDept={handleEditDept} onDeleteDept={handleDeleteDept} onMoveDept={handleMoveDept} onAddDoctor={handleAddDoctor} onEditDoctor={handleEditDoctor} onDeleteDoctor={handleDeleteDoctor} onMoveDoctor={handleMoveDoctor} isAdmin={isAdmin} onRefreshData={handleRefreshData} onShowDoctorLink={handleShowDoctorLink} />
      )}
      {activeView === 'admin' && isAdmin && <AdminPanel users={allUsers} onApprove={handleApprove} onSetRole={handleSetRole} onDeleteUser={handleDeleteUser} />}
      {activeView === 'dashboard' && (isEditor || isModerator || isSubAdmin || isAdmin) && <AdminDashboard user={user} />}

      {showAuth && <AuthPage onClose={() => setShowAuth(false)} />}
      {deptModal && <DepartmentModal initial={deptModal.mode === 'edit' ? deptModal.dept : null} onSave={handleSaveDept} onClose={() => setDeptModal(null)} />}
      {doctorModal && (
        <DoctorModal
          initial={doctorModal.mode === 'edit' ? doctorModal.doctor : null}
          onSave={handleSaveDoctor}
          onClose={() => setDoctorModal(null)}
        />
      )}
      {panelModal && <PanelModal mode={panelModal.mode} initial={panelModal.mode === 'rename' ? panelModal.panel : null} activeDeptCount={activePanel.activeDoctorIds?.length || 0} departments={departments} onSave={handleSavePanel} onClose={() => setPanelModal(null)} />}
      {linkModalDoctor && <DoctorLinkModal doctor={linkModalDoctor} onClose={() => setLinkModalDoctor(null)} />}
    </div>
  );
}