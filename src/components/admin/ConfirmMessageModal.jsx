// src/components/admin/ConfirmMessageModal.jsx
// ==================================================
// 📩 ConfirmMessageModal — Patient arrival time
// ==================================================
// ✅ Preview with Bengali → English transliteration
// ✅ No emoji, English only
// ==================================================
import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, Edit3, AlertCircle, Clock } from 'lucide-react';

const RAILWAY_API_URL =
  'https://soothing-healing-production-8e36.up.railway.app';

// ==================================================
// ✅ Quick Time Preset Options
// ==================================================
const TIME_PRESETS = [
  { label: '08:00 AM', value: '08:00 AM' },
  { label: '08:30 AM', value: '08:30 AM' },
  { label: '09:00 AM', value: '09:00 AM' },
  { label: '09:30 AM', value: '09:30 AM' },
  { label: '10:00 AM', value: '10:00 AM' },
  { label: '10:30 AM', value: '10:30 AM' },
  { label: '11:00 AM', value: '11:00 AM' },
  { label: '11:30 AM', value: '11:30 AM' },
  { label: '12:00 PM', value: '12:00 PM' },
  { label: '12:30 PM', value: '12:30 PM' },
  { label: '01:00 PM', value: '01:00 PM' },
  { label: '02:00 PM', value: '02:00 PM' },
  { label: '03:00 PM', value: '03:00 PM' },
  { label: '04:00 PM', value: '04:00 PM' },
  { label: '05:00 PM', value: '05:00 PM' },
  { label: '06:00 PM', value: '06:00 PM' },
  { label: '07:00 PM', value: '07:00 PM' },
  { label: '08:00 PM', value: '08:00 PM' },
  { label: '08:30 PM', value: '08:30 PM' },
  { label: '09:00 PM', value: '09:00 PM' },
  { label: '10:00 PM', value: '10:00 PM' },
];

// ==================================================
// ✅ Format date as DD-MM-YYYY
// ==================================================
const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

// ==================================================
// ✅ Bengali → English Transliteration (for preview)
// ==================================================
const BN_TO_EN_MAP = {
  'অ': 'O', 'আ': 'A', 'ই': 'I', 'ঈ': 'I', 'উ': 'U', 'ঊ': 'U',
  'ঋ': 'Ri', 'এ': 'E', 'ঐ': 'Oi', 'ও': 'O', 'ঔ': 'Ou',
  'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
  'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou',
  'ক': 'K', 'খ': 'Kh', 'গ': 'G', 'ঘ': 'Gh', 'ঙ': 'Ng',
  'চ': 'Ch', 'ছ': 'Chh', 'জ': 'J', 'ঝ': 'Jh', 'ঞ': 'Ny',
  'ট': 'T', 'ঠ': 'Th', 'ড': 'D', 'ঢ': 'Dh', 'ণ': 'N',
  'ত': 'T', 'থ': 'Th', 'দ': 'D', 'ধ': 'Dh', 'ন': 'N',
  'প': 'P', 'ফ': 'Ph', 'ব': 'B', 'ভ': 'Bh', 'ম': 'M',
  'য': 'Y', 'র': 'R', 'ল': 'L', 'শ': 'Sh', 'ষ': 'Sh', 'স': 'S', 'হ': 'H',
  'ড়': 'R', 'ঢ়': 'Rh', 'য়': 'Y', 'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '',
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
  '।': '.', '্': '',
};

const transliterateToEnglish = (text) => {
  if (!text) return '';
  if (typeof text !== 'string') return String(text);

  let result = text
    .replace(/ডাঃ/g, 'Dr. ')
    .replace(/ডা\./g, 'Dr. ')
    .replace(/মোঃ/g, 'M. ')
    .replace(/মোছাঃ/g, 'Mst. ')
    .replace(/মিসেস/g, 'Mrs. ')
    .replace(/মিস্টার/g, 'Mr. ')
    .replace(/শ্রী/g, 'Sri ');

  let out = '';
  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (BN_TO_EN_MAP[ch] !== undefined) {
      out += BN_TO_EN_MAP[ch];
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
};

export default function ConfirmMessageModal({
  appointment,
  hospitalId,
  onClose,
  onSuccess,
}) {
  const [serialNo, setSerialNo] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Appointment থেকে প্রাথমিক মান লোড
  useEffect(() => {
    if (appointment) {
      setSerialNo(appointment.serialNo || '');

      // Default arrival time — বর্তমান সময়ের পরবর্তী ঘন্টা
      const now = new Date();
      const nextHour = now.getHours() + 1;
      const hour12 = nextHour > 12 ? nextHour - 12 : nextHour === 0 ? 12 : nextHour;
      const period = nextHour < 12 ? 'AM' : 'PM';
      setArrivalTime(`${String(hour12).padStart(2, '0')}:00 ${period}`);
    }
  }, [appointment]);

  if (!appointment) return null;

  // ==================================================
  // ✅ Transliterate names for preview
  // ==================================================
  const englishPatientName = transliterateToEnglish(appointment.name || '');
  const englishDoctorName = transliterateToEnglish(appointment.doctorName || '');

  // ==================================================
  // ✅ Preview Message
  // ==================================================
  const previewMessage = `Al-Afiyah Hospital
Dear ${englishPatientName},
Serial: ${serialNo || appointment.serialNo}
Doctor: ${englishDoctorName}
Date: ${formatDateDDMMYYYY(appointment.bookingDate)}
Time: ${arrivalTime || 'As scheduled'}
Booking Confirmed. Thank you.`;

  const handleConfirm = async () => {
    if (!serialNo.toString().trim()) {
      setError('সিরিয়াল নম্বর দিন');
      return;
    }
    if (!arrivalTime.trim()) {
      setError('রোগীর আসার সময় দিন');
      return;
    }

    if (!window.confirm('এই তথ্য দিয়ে রোগীকে মেসেজ পাঠাতে চান?')) return;

    setSending(true);
    setError('');

    try {
      const response = await fetch(
        `${RAILWAY_API_URL}/api/appointment/confirm-with-message`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hospitalId,
            appointmentId: appointment.id,
            customSerial: serialNo,
            customDoctorTime: arrivalTime.trim(),
            customNote: '',
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        console.log('✅ Confirm success');
        onSuccess && onSuccess();
        onClose();
      } else {
        setError(data.error || 'মেসেজ পাঠানো যায়নি');
      }
    } catch (err) {
      console.error('❌ Confirm API error:', err);
      setError('সার্ভারে সংযোগ ব্যর্থ: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          maxWidth: '760px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Edit3 size={20} color="#1c5fa8" />
              সিরিয়াল কনফার্ম করুন
            </h3>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '13px',
                color: '#64748b',
              }}
            >
              {englishPatientName} · {appointment.mobile} · {englishDoctorName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Serial No */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '6px',
              }}
            >
              🎫 সিরিয়াল নম্বর *
            </label>
            <input
              type="text"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1.5px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                fontWeight: '700',
                color: '#1c5fa8',
              }}
            />
          </div>

          {/* ✅ Patient Arrival Time */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '6px',
              }}
            >
              <Clock size={14} />
              রোগী কখন আসবে *
            </label>
            <input
              type="text"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              placeholder="যেমন: 08:30 PM"
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1.5px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '15px',
                boxSizing: 'border-box',
                fontWeight: '600',
                marginBottom: '10px',
              }}
            />
            <p
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                margin: '0 0 10px 0',
              }}
            >
              💡 নিচের প্রিসেট থেকে বেছে নিন অথবা নিজে লিখুন (ফরম্যাট: 08:30 PM)
            </p>

            {/* Quick Time Presets */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '4px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#f8fafc',
              }}
            >
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setArrivalTime(preset.value)}
                  style={{
                    padding: '6px 12px',
                    background: arrivalTime === preset.value ? '#1c5fa8' : '#fff',
                    color: arrivalTime === preset.value ? '#fff' : '#475569',
                    border:
                      '1px solid ' +
                      (arrivalTime === preset.value ? '#1c5fa8' : '#e2e8f0'),
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: '600',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1px dashed #86efac',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: '700',
                color: '#166534',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📱 রোগী এই মেসেজ পাবেন
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: '14px',
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif",
                lineHeight: '1.7',
              }}
            >
              {previewMessage}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: sending ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: '#475569',
            }}
          >
            বাতিল
          </button>
          <button
            onClick={handleConfirm}
            disabled={sending}
            style={{
              padding: '10px 26px',
              background: sending ? '#94a3b8' : '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: sending ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {sending ? (
              <>
                <Loader2 size={16} className="spin" />
                পাঠানো হচ্ছে...
              </>
            ) : (
              <>
                <Send size={16} />
                Confirm & Send
              </>
            )}
          </button>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </div>
    </div>
  );
}