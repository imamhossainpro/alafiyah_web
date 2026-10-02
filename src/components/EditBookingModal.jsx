// src/components/EditBookingModal.jsx
// ==================================================
// ✏️ EditBookingModal — Change date/doctor with serial re-assignment
// ==================================================
// ✅ Fixed: Bengali day-name matching (trim + lowercase + id fallback)
// ✅ Fixed: departments/panels empty state debugging
// ✅ Fixed: proper panel detection
// ==================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  Calendar,
  Stethoscope,
  Hash,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { db, doc, getDoc, setDoc, updateDoc } from '../firebase';
import { useHospital } from '../context/HospitalContext';

const BANGLA_DAYS = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার',
];

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getBanglaDay = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return BANGLA_DAYS[d.getDay()];
};

const MAX_DAYS_AHEAD = 7;

export default function EditBookingModal({
  appointment,
  departments = [],
  panels = [],
  onClose,
  onSuccess,
}) {
  const { currentHospital } = useHospital();
  const hospitalId = currentHospital?.id || 'alafiyah_main';

  const [newDate, setNewDate] = useState(appointment?.bookingDate || getTodayString());
  const [newDoctor, setNewDoctor] = useState(null);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [serialPreview, setSerialPreview] = useState(null);

  const todayStr = getTodayString();
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + MAX_DAYS_AHEAD);
    return d.toISOString().split('T')[0];
  }, []);

  // ==================================================
  // ✅ Load available doctors for selected date
  // ==================================================
  useEffect(() => {
    if (!panels || panels.length === 0) {
      console.warn('⚠️ [EditBookingModal] panels is empty');
      setAvailableDoctors([]);
      return;
    }
    if (!departments || departments.length === 0) {
      console.warn('⚠️ [EditBookingModal] departments is empty');
      setAvailableDoctors([]);
      return;
    }

    const dayName = getBanglaDay(newDate);

    // Try multiple strategies to find the panel
    let dayPanel = panels.find((p) => p.name === dayName || p.id === dayName);

    if (!dayPanel) {
      const dayLower = dayName.toLowerCase().trim();
      dayPanel = panels.find((p) => {
        const nameLower = (p.name || '').toLowerCase().trim();
        const idLower = (p.id || '').toLowerCase().trim();
        return nameLower === dayLower || idLower === dayLower;
      });
    }

    console.log('🔍 [EditBookingModal] Panel lookup:', {
      newDate,
      dayName,
      panelsCount: panels.length,
      departmentsCount: departments.length,
      panelNames: panels.map((p) => p.name || p.id),
      matchedPanel: dayPanel ? { id: dayPanel.id, name: dayPanel.name } : null,
    });

    if (!dayPanel) {
      setAvailableDoctors([]);
      return;
    }

    const activeIds = dayPanel.activeDoctorIds || [];
    const docs = [];

    departments.forEach((dept) => {
      (dept.doctors || []).forEach((doc) => {
        if (activeIds.includes(doc.id)) {
          docs.push({
            ...doc,
            deptId: dept.id,
            deptName: dept.name,
            deptColor: dept.color,
          });
        }
      });
    });

    console.log(`✅ [EditBookingModal] Found ${docs.length} doctors for ${dayName}`);
    setAvailableDoctors(docs);

    // If current doctor not in this date's list, auto-deselect
    if (newDoctor && !docs.some((d) => d.id === newDoctor.id)) {
      setNewDoctor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate, panels, departments]);

  // ==================================================
  // ✅ Initialize newDoctor from appointment
  // ==================================================
  useEffect(() => {
    if (!appointment || newDoctor) return;

    const match = availableDoctors.find((d) => d.id === appointment.doctorId);
    if (match) {
      setNewDoctor(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDoctors, appointment]);

  // ==================================================
  // ✅ Preview new serial
  // ==================================================
  useEffect(() => {
    if (!newDoctor || !newDate) {
      setSerialPreview(null);
      return;
    }

    const isSameDate = newDate === appointment?.bookingDate;
    const isSameDoctor = newDoctor.id === appointment?.doctorId;

    if (isSameDate && isSameDoctor) {
      setSerialPreview({
        serial: appointment.serialNo,
        isUnchanged: true,
      });
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      try {
        const counterKey = `${newDoctor.id}_${newDate}`;
        const counterRef = doc(db, 'hospitals', hospitalId, 'counters', counterKey);
        const snap = await getDoc(counterRef);
        const nextSerial = snap.exists() ? (snap.data().count || 0) + 1 : 1;
        setSerialPreview({
          serial: nextSerial,
          isUnchanged: false,
        });
      } catch (err) {
        console.error('Preview error:', err);
        setSerialPreview(null);
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDoctor?.id, newDate]);

  // ==================================================
  // ✅ Handle save
  // ==================================================
  const handleSave = async () => {
    if (!newDoctor) {
      setError('ডাক্তার নির্বাচন করুন');
      return;
    }
    if (!newDate) {
      setError('তারিখ নির্বাচন করুন');
      return;
    }
    if (newDate < todayStr) {
      setError('অতীতের তারিখ নির্বাচন করা যাবে না');
      return;
    }
    if (newDate > maxDate) {
      setError(`সর্বোচ্চ ${MAX_DAYS_AHEAD} দিন পর্যন্ত ভবিষ্যতের তারিখ নির্বাচন করা যাবে`);
      return;
    }

    const isSameDate = newDate === appointment.bookingDate;
    const isSameDoctor = newDoctor.id === appointment.doctorId;

    if (isSameDate && isSameDoctor) {
      setError('কোনো পরিবর্তন করা হয়নি');
      return;
    }

    if (!window.confirm('এই বুকিং এর তারিখ/ডাক্তার পরিবর্তন করতে চান?')) return;

    setSaving(true);
    setError('');

    try {
      // ==================================================
      // Step 1: নতুন serial number নিন
      // ==================================================
      let newSerial;
      const newCounterKey = `${newDoctor.id}_${newDate}`;
      const newCounterRef = doc(db, 'hospitals', hospitalId, 'counters', newCounterKey);

      const newCounterSnap = await getDoc(newCounterRef);
      if (newCounterSnap.exists()) {
        newSerial = (newCounterSnap.data().count || 0) + 1;
        await setDoc(
          newCounterRef,
          {
            count: newSerial,
            doctorId: newDoctor.id,
            doctorName: newDoctor.name,
            date: newDate,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        newSerial = 1;
        await setDoc(newCounterRef, {
          count: newSerial,
          doctorId: newDoctor.id,
          doctorName: newDoctor.name,
          date: newDate,
          createdAt: new Date().toISOString(),
        });
      }

      // ==================================================
      // Step 2: Old counter থেকে serial decrement
      // ==================================================
      const oldCounterKey = `${appointment.doctorId}_${appointment.bookingDate}`;
      const oldCounterRef = doc(db, 'hospitals', hospitalId, 'counters', oldCounterKey);
      const oldCounterSnap = await getDoc(oldCounterRef);

      if (oldCounterSnap.exists()) {
        const oldCount = oldCounterSnap.data().count || 0;
        if (oldCount > 0) {
          await updateDoc(oldCounterRef, {
            count: oldCount - 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // ==================================================
      // Step 3: Appointment update
      // ==================================================
      const doctorTime =
        newDoctor.timeSlots && newDoctor.timeSlots.length > 0
          ? `${newDoctor.timeSlots[0].start} - ${newDoctor.timeSlots[0].end}`
          : '';

      const apptRef = doc(db, 'hospitals', hospitalId, 'appointments', appointment.id);

      await updateDoc(apptRef, {
        bookingDate: newDate,
        bookingDay: getBanglaDay(newDate),
        doctorId: newDoctor.id,
        doctorName: newDoctor.name,
        doctorDept: newDoctor.deptName || '',
        doctorQuals: newDoctor.quals || '',
        doctorTime: doctorTime,
        serialNo: newSerial,
        updatedAt: new Date().toISOString(),
        editedBy: 'admin',
        editedAt: new Date().toISOString(),
      });

      console.log('✅ Booking updated:', {
        oldDate: appointment.bookingDate,
        newDate,
        oldDoctor: appointment.doctorName,
        newDoctor: newDoctor.name,
        newSerial,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('❌ Save error:', err);
      setError('সংরক্ষণ ব্যর্থ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!appointment) return null;

  const isSameDate = newDate === appointment.bookingDate;
  const isSameDoctor = newDoctor?.id === appointment.doctorId;
  const hasChanges = !isSameDate || !isSameDoctor;

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
          maxWidth: '700px',
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
              <Calendar size={20} color="#1c5fa8" />
              বুকিং সংশোধন
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              {appointment.name} · {appointment.mobile}
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

          {/* Current Booking Info */}
          <div
            style={{
              background: '#f1f5f9',
              padding: '14px 16px',
              borderRadius: '10px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>
              📋 বর্তমান বুকিং
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
              <span style={{ color: '#64748b' }}>তারিখ:</span>
              <span style={{ fontWeight: '700', color: '#1e293b' }}>
                {appointment.bookingDate} ({appointment.bookingDay})
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
              <span style={{ color: '#64748b' }}>ডাক্তার:</span>
              <span style={{ fontWeight: '700', color: '#1e293b' }}>{appointment.doctorName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
              <span style={{ color: '#64748b' }}>সিরিয়াল:</span>
              <span style={{ fontWeight: '700', color: '#1c5fa8', fontSize: '16px' }}>
                #{appointment.serialNo}
              </span>
            </div>
          </div>

          {/* New Date */}
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
              <Calendar size={14} />
              নতুন তারিখ
            </label>
            <input
              type="date"
              value={newDate}
              min={todayStr}
              max={maxDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '15px',
                boxSizing: 'border-box',
                fontWeight: '600',
              }}
            />
            <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              সর্বোচ্চ {MAX_DAYS_AHEAD} দিন পর্যন্ত (আজ: {todayStr})
            </p>
          </div>

          {/* New Doctor */}
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
              <Stethoscope size={14} />
              নতুন ডাক্তার ({getBanglaDay(newDate)})
            </label>

            {availableDoctors.length === 0 ? (
              <div
                style={{
                  padding: '14px 16px',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#92400e',
                }}
              >
                ⚠️ এই তারিখে কোনো ডাক্তার উপলব্ধ নেই।
                {panels.length === 0 && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: '#a16207' }}>
                    (কারণ: panels ডেটা লোড হয়নি)
                  </div>
                )}
                {panels.length > 0 && departments.length === 0 && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: '#a16207' }}>
                    (কারণ: departments ডেটা লোড হয়নি)
                  </div>
                )}
                {panels.length > 0 && departments.length > 0 && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: '#a16207' }}>
                    (এই দিনের প্যানেলে কোনো ডাক্তার assign করা নেই)
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              >
                {availableDoctors.map((doc) => {
                  const selected = newDoctor?.id === doc.id;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setNewDoctor(doc)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        background: selected ? '#f0fdf4' : '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b' }}>
                          {doc.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {doc.specialty || doc.deptName}
                        </div>
                      </div>
                      {selected && <CheckCircle2 size={18} color="#22c55e" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Serial Preview */}
          {hasChanges && newDoctor && (
            <div
              style={{
                background: '#eff6ff',
                border: '1.5px dashed #93c5fd',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: '#dbeafe',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Hash size={20} color="#1c5fa8" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>
                  নতুন সিরিয়াল নম্বর হবে
                </div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#1c5fa8' }}>
                  {loading ? (
                    <Loader2 size={18} className="spin" />
                  ) : serialPreview ? (
                    <>#{serialPreview.serial}</>
                  ) : (
                    <>#?</>
                  )}
                </div>
              </div>
              <ArrowRight size={20} color="#94a3b8" />
            </div>
          )}

          {!hasChanges && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '13px',
                color: '#64748b',
                textAlign: 'center',
              }}
            >
              কোনো পরিবর্তন করা হয়নি
            </div>
          )}
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
            disabled={saving}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: '#475569',
            }}
          >
            বাতিল
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !newDoctor}
            style={{
              padding: '10px 26px',
              background: !hasChanges || !newDoctor ? '#94a3b8' : '#1c5fa8',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: !hasChanges || !newDoctor || saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spin" />
                সংরক্ষণ...
              </>
            ) : (
              <>💾 সংরক্ষণ করুন</>
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