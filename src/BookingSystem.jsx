// src/components/BookingSystem.jsx
// ==================================================
// 📅 BookingSystem — Booking Form + Success Screen
// ==================================================
// ✅ BangladeshMobileInput (dual format + counter)
// ✅ Fixed Success Screen — No serial, no QR, no links
// ==================================================
import React, { useState, useEffect } from 'react';
import { db, doc, getDoc, setDoc, addDoc, collection } from './firebase';
import {
  findPatientByMobile,
  createPatient,
  addPatientVisit,
} from './services/patientService';
import { generateQRCode } from './services/qrService';
import { addLocationFromBooking } from './services/locationService';
import { useHospital } from './context/HospitalContext';
import { useAuth } from './context/AuthContext';
import BangladeshMobileInput from './components/BangladeshMobileInput';
import {
  Send,
  Loader2,
  User,
  Phone,
  MapPin,
  Stethoscope,
  CalendarDays,
  ArrowLeft,
  PlusCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  PhoneCall,
} from 'lucide-react';

const DEFAULT_HOSPITAL_ID = 'alafiyah_main';
const BANGLA_DAYS = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার',
];
const MAX_DAYS_AHEAD = 7;

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toEnglishDigits = (str) => {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return str.replace(/[০-৯]/g, (char) =>
    banglaDigits.indexOf(char) !== -1
      ? englishDigits[banglaDigits.indexOf(char)]
      : char
  );
};

// ---------- ক্যালেন্ডার (৭ দিনের সীমা সহ) ----------
function CustomCalendar({ selectedDate, onDateChange }) {
  const today = new Date();
  const todayStr = getTodayString();

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });

  useEffect(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-').map(Number);
      setViewDate(new Date(parts[0], parts[1] - 1, parts[2]));
    }
  }, [selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ];
  const dayNames = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

  return (
    <div className="custom-calendar">
      <div className="cal-header">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
        >
          &lt;
        </button>
        <span>
          {monthNames[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
        >
          &gt;
        </button>
      </div>
      <div className="cal-grid cal-weekdays">
        {dayNames.map((d) => (
          <div key={d} className="cal-day-name">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-grid cal-days">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="cal-day empty"></div>
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(
            2,
            '0'
          )}-${String(day).padStart(2, '0')}`;
          const isSelected = selectedDate === dateStr;
          const isPast = dateStr < todayStr;
          const isFutureBeyondMax = dateStr > maxDateStr;
          const isDisabled = isPast || isFutureBeyondMax;
          const isToday = dateStr === todayStr;

          return (
            <div
              key={day}
              className={`cal-day ${isSelected ? 'selected' : ''} ${
                isDisabled ? 'disabled' : ''
              } ${isToday ? 'today' : ''}`}
              onClick={() => !isDisabled && onDateChange(dateStr)}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- CSS ----------
const BookingCSS = `
  .booking-wrapper { max-width: 650px; margin: 40px auto; padding: 20px; font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif; background: #f4f7f6; border-radius: 20px; }
  .booking-card { background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); padding: 30px; border: 1px solid #e2e8f0; min-height: 500px; position: relative; }
  .booking-title { text-align: center; color: #0f766e; font-size: 24px; font-weight: 700; margin-bottom: 25px!important; font-family:'Hind Siliguri','Noto Sans Bengali',Arial,sans-serif;}
  .form-section { margin-bottom: 25px; }
  .section-title { font-size: 15px; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 8px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; }
  .form-group { margin-bottom: 15px; }
  .form-group label { display: block; font-size: 13.5px; font-weight: 600; color: #475569; margin-bottom: 6px; }
  .required-asterisk { color: #dc2626; margin-left: 4px; }
  .input, .select, .textarea { width: 100%; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; font-family: inherit; color: #1e293b; background: #fff; transition: all 0.2s ease; box-sizing: border-box; }
  .input:focus, .select:focus, .textarea:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15); }
  .textarea { resize: vertical; min-height: 80px; }
  .conditional-field { margin-top: 10px; padding: 10px; background: #f0fdfa; border-left: 3px solid #0d9488; border-radius: 0 8px 8px 0; animation: slideDown 0.3s ease; }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
  .day-badge { display: inline-block; background: #0f766e; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 12px; margin-top: 5px; }
  .doctor-options { max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 10px; background: #fff; }
  .doctor-option { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .doctor-option:last-child { border-bottom: none; }
  .doctor-option:hover, .doctor-option.selected { background: #f0fdfa; }
  .doctor-name { font-weight: 700; color: #1e293b; font-size: 15px; }
  .doctor-details { font-size: 12.5px; color: #64748b; margin-top: 2px; text-align: left; }
  .slot-display { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  .slot-badge { background: #08eb9ff1; padding: 2px 12px; border-radius: 12px; font-size: 12px; color: #1e293b; border: 1px solid #e2e8f0; }
  .clear-doctor-btn { width: 100%; padding: 10px; margin-top: 10px; background: #f1f5f9; border: 1px dashed #cbd5e1; color: #475569; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
  .clear-doctor-btn:hover { background: #e2e8f0; color: #1e293b; }
  .summary-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
  .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
  .summary-label { color: #64748b; font-weight: 500; }
  .summary-value { color: #1e293b; font-weight: 700; text-align: right; }
  .submit-btn { width: 100%; padding: 14px; background: linear-gradient(45deg, #0d9488, #14b8a6); border: none; border-radius: 12px; color: white; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; transition: all 0.3s; box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.2); }
  .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(13, 148, 136, 0.3); }
  .submit-btn:active { transform: scale(0.96); }
  .submit-btn:disabled { background: #94a3b8; cursor: not-allowed; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .custom-calendar { background: linear-gradient(135deg, #0d9488, #0f766e); padding: 20px; border-radius: 16px; color: white; box-shadow: 0 10px 25px rgba(13, 148, 136, 0.3); margin-bottom: 20px; }
  .cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-weight: 800; font-size: 16px; }
  .cal-header button { background: rgba(255,255,255,0.2); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
  .cal-header button:hover { background: rgba(255,255,255,0.4); }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center; }
  .cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.2); }
  .cal-day-name { font-size: 13px; font-weight: 700; color: rgba(255, 255, 255, 0.9); display: flex; align-items: center; justify-content: center; height: 30px; }
  .cal-day { width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer; font-size: 14px; margin: 0 auto; transition: 0.2s; }
  .cal-day:hover { background: rgba(255,255,255,0.2); }
  .cal-day.empty { pointer-events: none; }
  .cal-day.selected { background: #fff; color: #0d9488; font-weight: 800; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
  .cal-day.today { border: 2px solid rgba(255,255,255,0.8); }
  .cal-day.disabled { opacity: 0.4; cursor: not-allowed; background: transparent; }

  /* ==========================================
     ✅ SUCCESS SCREEN — FIXED
     ========================================== */
  .success-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    text-align: center;
    padding: 30px 20px 50px 20px;
    min-height: 500px;
    animation: fadeIn 0.5s ease;
    width: 100%;
    box-sizing: border-box;
  }

  .lottie-container {
    width: 120px;
    height: 120px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .animated-checkmark {
    width: 100px;
    height: 100px;
  }

  .animated-checkmark circle {
    fill: #22c55e;
    stroke: none;
  }

  .animated-checkmark path {
    stroke: #ffffff;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
    stroke-dasharray: 48;
    stroke-dashoffset: 48;
    animation: stroke 0.5s ease forwards 0.3s;
  }

  @keyframes stroke {
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .success-title {
    font-size: 28px;
    color: #166534;
    font-weight: 800;
    margin-bottom: 24px;
    line-height: 1.3;
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif;
  }

  .success-info-box {
    background: #f0f9ff;
    border: 1.5px solid #bae6fd;
    border-radius: 14px;
    padding: 20px 22px;
    margin-bottom: 18px;
    max-width: 480px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 14px;
    text-align: left;
  }

  .success-info-icon {
    flex-shrink: 0;
    width: 46px;
    height: 46px;
    background: #e0f2fe;
    border-radius: 23px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .success-info-text {
    flex: 1;
    font-size: 15px;
    color: #0c4a6e;
    line-height: 1.7;
    margin: 0;
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif;
  }

  .success-info-text strong {
    color: #1c5fa8;
    font-weight: 700;
  }

  .success-note-box {
    background: #fef9c3;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 12px 20px;
    margin-bottom: 32px;
    max-width: 480px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .success-note-text {
    font-size: 13.5px;
    color: #92400e;
    margin: 0;
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif;
    font-weight: 600;
  }

  .success-buttons {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
    width: 100%;
    max-width: 480px;
  }

  .success-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 22px;
    border-radius: 10px;
    font-size: 14.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif;
    flex: 1;
    min-width: 180px;
  }

  .success-btn-primary {
    background: #1c5fa8;
    color: #fff;
  }

  .success-btn-primary:hover {
    background: #154a82;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(28, 95, 168, 0.3);
  }

  .success-btn-secondary {
    background: #f1f5f9;
    color: #1e293b;
    border: 1.5px solid #cbd5e1;
  }

  .success-btn-secondary:hover {
    background: #e2e8f0;
    transform: translateY(-2px);
  }

  @media (max-width: 600px) {
    .booking-wrapper { margin: 0; padding: 10px; }
    .booking-card { padding: 20px; }
    .summary-row { flex-direction: column; gap: 4px; }
    .summary-value { text-align: left; }
    .cal-day { width: 30px; height: 30px; font-size: 12px; }

    .success-screen {
      padding: 20px 12px 40px 12px;
      min-height: auto;
    }

    .success-title {
      font-size: 22px;
    }

    .success-info-box {
      flex-direction: column;
      text-align: center;
      align-items: center;
      padding: 18px 16px;
    }

    .success-info-text {
      text-align: center;
      font-size: 14px;
    }

    .success-buttons {
      flex-direction: column;
    }

    .success-btn {
      width: 100%;
      min-width: unset;
    }
  }
`;

// ---------- মূল BookingSystem ----------
export default function BookingSystem({ departments, panels, onBack }) {
  const { currentHospital } = useHospital();
  const hospitalId = currentHospital?.id || DEFAULT_HOSPITAL_ID;
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    mobile: '',
    gender: 'পুরুষ',
    address: '',
    referralSource: 'Walk-in / নিজে এসেছেন',
    referredDoctorName: '',
    otherReferralNote: '',
    departmentId: '',
  });

  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedDayName, setSelectedDayName] = useState('');
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isBooked, setIsBooked] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [qrCode, setQrCode] = useState(null);
  const [appointmentId, setAppointmentId] = useState(null);
  const [bookedSerialNo, setBookedSerialNo] = useState(null);

  useEffect(() => {
    if (!panels || panels.length === 0) {
      console.warn('⚠️ Panels খালি বা undefined');
      setAvailableDoctors([]);
      return;
    }
    if (!departments || departments.length === 0) {
      console.warn('⚠️ Departments খালি বা undefined');
      setAvailableDoctors([]);
      return;
    }

    const dateObj = new Date(selectedDate);
    const englishDay = dateObj.getDay();
    const dayName = BANGLA_DAYS[englishDay];
    setSelectedDayName(dayName);

    const dayPanel = panels.find((p) => p.name === dayName);
    if (!dayPanel) {
      setAvailableDoctors([]);
      return;
    }

    const activeIds = dayPanel.activeDoctorIds || [];
    if (activeIds.length === 0) {
      setAvailableDoctors([]);
      return;
    }

    const filteredDocs = [];
    departments.forEach((dept) => {
      const deptDoctors = dept.doctors || [];
      deptDoctors.forEach((doc) => {
        if (activeIds.includes(doc.id)) {
          filteredDocs.push({ ...doc, deptName: dept.name, deptId: dept.id });
        }
      });
    });

    setAvailableDoctors(filteredDocs);
    setSelectedDoctor(null);
  }, [selectedDate, panels, departments]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'age') {
      setFormData((prev) => ({ ...prev, [name]: toEnglishDigits(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    if (name === 'departmentId') setSelectedDoctor(null);
    setSuccessMsg('');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      age: '',
      mobile: '',
      gender: 'পুরুষ',
      address: '',
      referralSource: 'Walk-in / নিজে এসেছেন',
      referredDoctorName: '',
      otherReferralNote: '',
      departmentId: '',
    });
    setSelectedDate(getTodayString());
    setAvailableDoctors([]);
    setSelectedDoctor(null);
    setSuccessMsg('');
    setQrCode(null);
    setAppointmentId(null);
    setBookedSerialNo(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    try {
      // ---------- Validation ----------
      if (!formData.name.trim()) throw new Error('রোগীর নাম লিখুন');
      if (!formData.age.trim()) throw new Error('বয়স লিখুন');
      if (!formData.mobile.trim()) throw new Error('মোবাইল নম্বর লিখুন');
      if (formData.mobile.length < 10)
        throw new Error('সঠিক ১০ বা ১১ digit মোবাইল নম্বর লিখুন');
      if (!selectedDoctor) throw new Error('ডাক্তার নির্বাচন করুন');
      if (!selectedDate) throw new Error('তারিখ নির্বাচন করুন');

      if (typeof hospitalId !== 'string') {
        throw new Error('hospitalId অবশ্যই একটি স্ট্রিং হতে হবে।');
      }

      // ==================================================
      // ১. Patient তৈরি / খোঁজ
      // ==================================================
      let patient = await findPatientByMobile(hospitalId, formData.mobile);
      let patientId;
      let isNewPatient = true;

      if (patient) {
        patientId = patient.id;
        isNewPatient = false;
        await addPatientVisit(hospitalId, {
          patientId,
          doctorName: selectedDoctor.name,
          visitDate: selectedDate,
        });
      } else {
        const newPatient = await createPatient(hospitalId, {
          name: formData.name,
          mobile: formData.mobile,
          age: formData.age,
          gender: formData.gender,
          address: formData.address,
        });
        patientId = newPatient.id;
        isNewPatient = true;
        await addPatientVisit(hospitalId, {
          patientId,
          doctorName: selectedDoctor.name,
          visitDate: selectedDate,
        });
      }

      // ==================================================
      // ২. Serial Number
      // ==================================================
      const bookingDateStr = selectedDate;
      const counterKey = `${selectedDoctor.id}_${bookingDateStr}`;
      const counterRef = doc(
        db,
        'hospitals',
        hospitalId,
        'counters',
        counterKey
      );

      let serialNo = 1;
      const counterDoc = await getDoc(counterRef);

      if (counterDoc.exists()) {
        serialNo = (counterDoc.data().count || 0) + 1;
        await setDoc(
          counterRef,
          {
            count: serialNo,
            doctorId: selectedDoctor.id,
            doctorName: selectedDoctor.name,
            date: bookingDateStr,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        await setDoc(counterRef, {
          count: serialNo,
          doctorId: selectedDoctor.id,
          doctorName: selectedDoctor.name,
          date: bookingDateStr,
          createdAt: new Date().toISOString(),
        });
      }

      // ==================================================
      // ৩. Appointment তৈরি
      // ==================================================
      const appointmentData = {
        ...formData,
        patientId,
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.name,
        doctorDept: selectedDoctor.deptName,
        doctorQuals: selectedDoctor.quals || '',
        doctorTime:
          selectedDoctor.timeSlots && selectedDoctor.timeSlots.length > 0
            ? `${selectedDoctor.timeSlots[0].start} - ${selectedDoctor.timeSlots[0].end}`
            : '',
        bookingDate: selectedDate,
        bookingDay: selectedDayName,
        serialNo,
        status: 'pending',
        timestamp: new Date().toISOString(),
        isNew: isNewPatient,
        isRead: false,
        hospitalId,
      };

      const docRef = await addDoc(
        collection(db, 'hospitals', hospitalId, 'appointments'),
        appointmentData
      );
      setAppointmentId(docRef.id);
      setBookedSerialNo(serialNo);

      // ---------- Location save ----------
      if (formData.address && formData.address.trim()) {
        await addLocationFromBooking(hospitalId, formData.address, docRef.id);
      }

      // ---------- QR code (silent, not shown to patient) ----------
      try {
        const qrImage = await generateQRCode(docRef.id);
        if (qrImage) setQrCode(qrImage);
      } catch (qrErr) {
        console.warn('QR generation failed (non-critical):', qrErr);
      }

      setSuccessMsg(
        'আপনার সিরিয়ালটি সফলভাবে কনফার্ম করা হয়েছে। চেক-ইন করতে QR কোড ব্যবহার করুন।'
      );
      setIsBooked(true);
    } catch (error) {
      console.error('Booking error:', error);
      alert(error.message || 'বুকিং সম্পন্ন হয়নি। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  const handleNewBooking = () => {
    resetForm();
    setIsBooked(false);
  };

  const handleBackToDoctors = () => {
    if (onBack) onBack();
    else {
      resetForm();
      setIsBooked(false);
    }
  };

  const filteredDoctors = selectedDoctor
    ? availableDoctors.filter((doc) => doc.id === selectedDoctor.id)
    : availableDoctors.filter(
        (doc) =>
          !formData.departmentId || doc.deptId === formData.departmentId
      );

  return (
    <div className="booking-wrapper">
      <style>{BookingCSS}</style>
      <div className="booking-card">
        {isBooked ? (
          /* ==================================================
             ✅ SUCCESS SCREEN — Fixed
             ================================================== */
          <div className="success-screen">
            <div className="lottie-container">
              <svg
                className="animated-checkmark"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 52 52"
              >
                <circle cx="26" cy="26" r="25" fill="none" />
                <path fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>

            <h3 className="success-title">বুকিং সফল হয়েছে!</h3>

            <div className="success-info-box">
              <div className="success-info-icon">
                <MessageSquare size={22} color="#1c5fa8" />
              </div>
              <p className="success-info-text">
                আপনার সিরিয়াল নিশ্চিত হলে আপনার মোবাইল নাম্বারে{' '}
                <strong>মেসেজের মাধ্যমে কনফার্মেশন</strong> পাবেন।
              </p>
            </div>

            <div className="success-note-box">
              <p className="success-note-title">যেকোনো জিজ্ঞাসায় যোগাযোগ করুন</p>
              <div className="success-note-phones">
                <a href="tel:01886776512" className="success-phone-link">
                  <span className="success-phone-icon">
                    <PhoneCall size={14} color="#fff" strokeWidth={2.5} />
                  </span>
                  <span className="success-phone-text">01886-776512</span>
                </a>
                <a href="tel:01886776513" className="success-phone-link">
                  <span className="success-phone-icon">
                    <PhoneCall size={14} color="#fff" strokeWidth={2.5} />
                  </span>
                  <span className="success-phone-text">01886-776513</span>
                </a>
              </div>
            </div>

            <div className="success-buttons">
              <button
                className="success-btn success-btn-secondary"
                onClick={handleBackToDoctors}
              >
                <ArrowLeft size={18} /> ফিরে যান হোমপেইজে
              </button>
              <button
                className="success-btn success-btn-primary"
                onClick={handleNewBooking}
              >
                <PlusCircle size={18} /> আরো একটি সিরিয়াল দিন
              </button>
            </div>
          </div>
        ) : (
          /* ==================================================
             BOOKING FORM
             ================================================== */
          <form onSubmit={handleSubmit}>
            <h2 className="booking-title">রোগীর ডাক্তার বুকিং ফর্ম</h2>

            <div className="form-section">
              <div className="section-title">
                <CalendarDays size={18} /> বুকিং তারিখ নির্বাচন
              </div>
              <div className="form-group">
                <CustomCalendar
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                />
                {selectedDayName && (
                  <span className="day-badge">
                    সপ্তাহের দিন: {selectedDayName}
                  </span>
                )}
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">
                <User size={18} /> রোগীর তথ্য{' '}
                <span className="required-asterisk">*</span>
              </div>
              <div className="form-group">
                <label>
                  রোগীর নাম <span className="required-asterisk">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="আপনার পুরো নাম"
                />
              </div>
              <div className="form-group">
                <label>
                  বয়স (বাংলা বা ইংরেজি সংখ্যায়){' '}
                  <span className="required-asterisk">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  required
                  placeholder="যেমনঃ ২৫ বা 25"
                />
              </div>

              {/* ✅ Bangladesh Mobile Number Input */}
              <BangladeshMobileInput
                value={formData.mobile}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, mobile: val }))
                }
                label="মোবাইল নম্বর"
                required={true}
                placeholder="মোবাইল নম্বর লিখুন"
                name="mobile"
              />

              <div className="form-group">
                <label>
                  লিঙ্গ <span className="required-asterisk">*</span>
                </label>
                <select
                  className="select"
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  required
                >
                  <option value="পুরুষ">পুরুষ</option>
                  <option value="মহিলা">মহিলা</option>
                  <option value="অন্যান্য">অন্যান্য</option>
                </select>
              </div>
              <div className="form-group">
                <label>বর্তমান ঠিকানা (ঐচ্ছিক)</label>
                <textarea
                  className="textarea"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="আপনার বর্তমান ঠিকানা লিখুন (যদি ইচ্ছা)"
                />
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">
                <MapPin size={18} /> রেফারেল তথ্য (ঐচ্ছিক)
              </div>
              <div className="form-group">
                <label>রোগী কীভাবে/কার মাধ্যমে এসেছেন?</label>
                <select
                  className="select"
                  name="referralSource"
                  value={formData.referralSource}
                  onChange={handleChange}
                >
                  <option>Walk-in / নিজে এসেছেন</option>
                  <option>Refer Doctor</option>
                  <option>Facebook</option>
                  <option>Google</option>
                  <option>Campaign / Medical Camp</option>
                  <option>আত্মীয়/বন্ধু</option>
                  <option>অন্যান্য</option>
                </select>
              </div>
              {formData.referralSource === 'Refer Doctor' && (
                <div className="conditional-field">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>রেফারিং ডাক্তারের নাম লিখুন</label>
                    <input
                      type="text"
                      className="input"
                      name="referredDoctorName"
                      value={formData.referredDoctorName}
                      onChange={handleChange}
                      placeholder="যেমনঃ ডাঃ কামরুল হাসান"
                    />
                  </div>
                </div>
              )}
              {formData.referralSource === 'অন্যান্য' && (
                <div className="conditional-field">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>অন্যান্য উৎস সম্পর্কে লিখুন</label>
                    <input
                      type="text"
                      className="input"
                      name="otherReferralNote"
                      value={formData.otherReferralNote}
                      onChange={handleChange}
                      placeholder="যেমনঃ ফেসবুক গ্রুপ, মাইক্রোব্লগ, পরিচিতজন ইত্যাদি"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="form-section">
              <div className="section-title">
                <Stethoscope size={18} /> অ্যাপয়েন্টমেন্ট ডাক্তার নির্বাচন{' '}
                <span className="required-asterisk">*</span>
              </div>

              <div className="form-group">
                <label>বিভাগ নির্বাচন করুন</label>
                <select
                  className="select"
                  name="departmentId"
                  value={formData.departmentId}
                  onChange={handleChange}
                >
                  <option value="">সব বিভাগ</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>
                  ডাক্তার নির্বাচন করুন ({selectedDayName}){' '}
                  <span className="required-asterisk">*</span>
                </label>
                <div className="doctor-options">
                  {filteredDoctors.length === 0 ? (
                    <div
                      style={{
                        padding: '15px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '14px',
                      }}
                    >
                      {availableDoctors.length === 0 ? (
                        <div>
                          <p>
                            ⚠️ এই দিনে ({selectedDayName}) কোনো ডাক্তারের সিরিয়াল
                            নেই।
                          </p>
                          <p
                            style={{
                              fontSize: '12px',
                              marginTop: '5px',
                              color: '#94a3b8',
                            }}
                          >
                            {panels?.length === 0
                              ? 'প্যানেল ডেটা পাওয়া যায়নি।'
                              : 'অন্য কোনো দিন নির্বাচন করুন।'}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p>⚠️ নির্বাচিত বিভাগে ডাক্তার নেই।</p>
                          <p
                            style={{
                              fontSize: '12px',
                              marginTop: '5px',
                              color: '#94a3b8',
                            }}
                          >
                            অন্য বিভাগ নির্বাচন করুন।
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    filteredDoctors.map((doc) => (
                      <div
                        key={doc.id}
                        className={`doctor-option ${
                          selectedDoctor?.id === doc.id ? 'selected' : ''
                        }`}
                        onClick={() => setSelectedDoctor(doc)}
                      >
                        <div>
                          <div className="doctor-name">{doc.name}</div>
                          <div className="doctor-details">
                            {doc.specialty || doc.quals || doc.deptName}
                          </div>
                          {doc.timeSlots && doc.timeSlots.length > 0 && (
                            <div className="slot-display">
                              {doc.timeSlots.map((slot, idx) => (
                                <span key={idx} className="slot-badge">
                                  ⏱ {slot.start} - {slot.end}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedDoctor?.id === doc.id && (
                          <CheckCircle2 size={18} color="#0d9488" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                {selectedDoctor && (
                  <button
                    type="button"
                    className="clear-doctor-btn"
                    onClick={() => setSelectedDoctor(null)}
                  >
                    ডাক্তার পরিবর্তন করুন (ডিসিলেক্ট)
                  </button>
                )}
              </div>
            </div>

            <div className="summary-box">
              <div
                className="section-title"
                style={{
                  borderBottom: 'none',
                  marginBottom: '10px',
                  paddingBottom: '0',
                }}
              >
                বুকিং সামারি
              </div>
              <div className="summary-row">
                <span className="summary-label">তারিখ:</span>
                <span className="summary-value">
                  {selectedDate} ({selectedDayName})
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">রোগীর নাম:</span>
                <span className="summary-value">{formData.name || '-'}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">মোবাইল:</span>
                <span className="summary-value">{formData.mobile || '-'}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">ঠিকানা:</span>
                <span className="summary-value">{formData.address || '-'}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">নির্বাচিত ডাক্তার:</span>
                <span className="summary-value">
                  {selectedDoctor?.name || '-'}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">রেফারেল সোর্স:</span>
                <span className="summary-value">
                  {formData.referralSource || '-'}
                </span>
              </div>
              {formData.referredDoctorName && (
                <div className="summary-row">
                  <span className="summary-label">রেফারিং ডাক্তার:</span>
                  <span className="summary-value">
                    {formData.referredDoctorName}
                  </span>
                </div>
              )}
              {formData.otherReferralNote && (
                <div className="summary-row">
                  <span className="summary-label">অন্যান্য নোট:</span>
                  <span className="summary-value">
                    {formData.otherReferralNote}
                  </span>
                </div>
              )}
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <Send size={18} />
              )}
              সিরিয়াল নিশ্চিত করুন
            </button>
          </form>
        )}
      </div>
    </div>
  );
}