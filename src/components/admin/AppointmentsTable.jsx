// src/components/admin/AppointmentsTable.jsx
// ==================================================
// 📋 AppointmentsTable — With Date Filter + Confirm Modal
// ==================================================
// ✅ Fixed: departments + panels props for EditBookingModal
// ==================================================
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppointmentsTableSkeleton } from '../ui/SkeletonScreens';
import {
  CheckCircle,
  XCircle,
  UserCheck,
  Archive,
  Trash2,
  Clock,
  Stethoscope,
  LayoutList,
  Undo2,
  Eye,
  Search,
  Edit2,
  Save,
  X,
  ArrowUpDown,
  Printer,
  XCircle as XCircleIcon,
  QrCode,
  Calendar,
  Filter,
} from 'lucide-react';
import { db, doc, getDoc, updateDoc } from '../../firebase';
import { useHospital } from '../../context/HospitalContext';
import { usePermission } from '../../context/PermissionContext';
import {
  invalidatePatientsCache,
  subscribeToPatients,
} from '../../services/patientService';
import {
  logActivity,
  LOG_MODULES,
  LOG_ACTIONS,
} from '../../services/activityLogService';
import ConfirmMessageModal from './ConfirmMessageModal';
import EditBookingModal from '../EditBookingModal';

// ==================================================
// ✅ Status Badge
// ==================================================
const StatusBadge = ({ status }) => {
  const styles = {
    pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
    confirmed: { bg: '#dbeafe', color: '#1e40af', label: 'Confirmed' },
    'checked-in': { bg: '#ede9fe', color: '#6d28d9', label: 'Checked-in' },
    completed: { bg: '#dcfce7', color: '#166534', label: 'Completed' },
    cancelled: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
    'no-show': { bg: '#f3f4f6', color: '#4b5563', label: 'No-show' },
    archived: { bg: '#e5e7eb', color: '#374151', label: 'Archived' },
  };
  const style = styles[status] || styles.pending;
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        padding: '4px 8px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '700',
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  );
};

// ==================================================
// ✅ Valid Status Transitions
// ==================================================
const validTransitions = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked-in', 'cancelled', 'no-show', 'pending'],
  'checked-in': ['completed', 'confirmed', 'pending', 'cancelled', 'no-show'],
  completed: ['checked-in', 'confirmed', 'pending', 'cancelled', 'no-show'],
  cancelled: ['pending', 'confirmed', 'checked-in', 'no-show'],
  'no-show': ['pending', 'confirmed', 'checked-in', 'completed'],
  archived: [],
};

// ==================================================
// ✅ Action Button
// ==================================================
const ActionButton = ({ onClick, title, bg, icon }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: bg,
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      padding: '5px 8px',
      cursor: 'pointer',
      marginRight: '4px',
    }}
  >
    {icon}
  </button>
);

// ==================================================
// ✅ Referral Sources
// ==================================================
const REFERRAL_SOURCES = [
  'Walk-in / নিজে এসেছেন',
  'Refer Doctor',
  'Facebook',
  'Google',
  'Campaign / Medical Camp',
  'আত্মীয়/বন্ধু',
  'অন্যান্য',
];

// ==================================================
// ✅ Bangladesh Timezone Helpers
// ==================================================
const BD_OFFSET_MINUTES = 6 * 60;

const getBDDate = () => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + BD_OFFSET_MINUTES * 60000);
};

const toDateString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeBookingDate = (bookingDate) => {
  if (!bookingDate) return null;
  if (typeof bookingDate === 'string') return bookingDate.split('T')[0];
  if (bookingDate?.toDate) return toDateString(bookingDate.toDate());
  if (bookingDate?.seconds) return toDateString(new Date(bookingDate.seconds * 1000));
  try {
    return toDateString(new Date(bookingDate));
  } catch {
    return null;
  }
};

// ==================================================
// ✅ Date Preset Helpers
// ==================================================
const getDateRange = (preset) => {
  const today = getBDDate();
  const todayStr = toDateString(today);

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr };

    case 'week': {
      const d = new Date(today);
      d.setDate(today.getDate() - 6);
      return { start: toDateString(d), end: todayStr };
    }

    case 'month': {
      const targetMonth = today.getMonth() - 1;
      const targetYear = today.getFullYear();
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      const day = Math.min(today.getDate(), lastDay);
      const d = new Date(targetYear, targetMonth, day);
      return { start: toDateString(d), end: todayStr };
    }

    case 'year': {
      const d = new Date(today);
      d.setFullYear(today.getFullYear() - 1);
      return { start: toDateString(d), end: todayStr };
    }

    case 'all':
    default:
      return { start: '2020-01-01', end: '2030-12-31' };
  }
};

// ==================================================
// ✅ Patient Type Calculator
// ==================================================
const calculatePatientType = (patient, appointment) => {
  if (!appointment) return 'অজানা';

  if (appointment.patientTypeOverride) {
    return appointment.patientTypeOverride;
  }

  if (!patient) return 'অজানা';

  const visits = patient.visits || [];
  const doctorName = appointment.doctorName;

  if (!doctorName) return 'অজানা';

  const doctorVisits = visits.filter(
    (v) => v.doctorName === doctorName && v.date < appointment.bookingDate
  );

  if (doctorVisits.length === 0) return 'নতুন';

  const sorted = [...doctorVisits].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const last = sorted[0];
  const diffDays = Math.ceil(
    Math.abs(new Date(last.date) - new Date(appointment.bookingDate)) /
      (1000 * 60 * 60 * 24)
  );

  return diffDays <= 7 ? 'রিপোর্ট' : 'ফলোআপ';
};

// ==================================================
// ✅ MAIN COMPONENT
// ==================================================
export default function AppointmentsTable({
  appointments,
  onStatusChange,
  onArchive,
  onRestore,
  onPermanentDelete,
  isArchivedView,
  user,
  marketingTeam = [],
  onAppointmentsChange,
  departments = [],   // ✅ NEW
  panels = [],        // ✅ NEW
}) {
  const { currentHospital } = useHospital();
  const hospitalId = currentHospital?.id;
  const { can } = usePermission();

  const [viewMode, setViewMode] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewDetails, setViewDetails] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [patientTypes, setPatientTypes] = useState({});
  const [allPatients, setAllPatients] = useState({});
  const [updatingPatient, setUpdatingPatient] = useState(null);
  const [updatingHighlight, setUpdatingHighlight] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');

  // ✅ Date Filter States
  const [datePreset, setDatePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ✅ Confirm Modal State
  const [confirmModalAppt, setConfirmModalAppt] = useState(null);

  // ✅ Edit Booking Modal State
  const [editBookingModalAppt, setEditBookingModalAppt] = useState(null);

  const userModifiedRef = useRef(new Set());
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const [filterOfficer, setFilterOfficer] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDoctor, setFilterDoctor] = useState('all');

  // ==================================================
  // ✅ Permission shortcuts
  // ==================================================
  const canView = can('booking.view');
  const canEdit = can('booking.edit');
  const canStatusChange = can('booking.status_change');
  const canPatientTypeChange = can('booking.patient_type_change');
  const canMarketingAssign = can('booking.marketing_assignment');
  const canReferralEdit = can('booking.referral_edit');
  const canPrint = can('booking.print');
  const canQR = can('booking.qr_view');
  const canArchive = can('booking.archive');
  const canRestore = can('archive.restore');
  const canPermanentDelete = can('archive.delete');

  // ==================================================
  // ✅ Date Preset Change Handler
  // ==================================================
  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'custom') {
      return;
    } else {
      const range = getDateRange(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  // ==================================================
  // ✅ Filter & Sort
  // ==================================================
  const uniqueDoctors = useMemo(() => {
    const doctors = new Set();
    appointments.forEach((a) => {
      if (a.doctorName) doctors.add(a.doctorName);
    });
    return ['all', ...Array.from(doctors)];
  }, [appointments]);

  const uniqueStatuses = [
    'all',
    'pending',
    'confirmed',
    'checked-in',
    'completed',
    'cancelled',
    'no-show',
  ];

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;

    // ✅ ১. Date Filter
    if (startDate && endDate) {
      filtered = filtered.filter((a) => {
        const apptDate = normalizeBookingDate(a.bookingDate);
        if (!apptDate) return false;
        return apptDate >= startDate && apptDate <= endDate;
      });
    } else if (startDate) {
      filtered = filtered.filter((a) => {
        const apptDate = normalizeBookingDate(a.bookingDate);
        return apptDate && apptDate >= startDate;
      });
    } else if (endDate) {
      filtered = filtered.filter((a) => {
        const apptDate = normalizeBookingDate(a.bookingDate);
        return apptDate && apptDate <= endDate;
      });
    }

    // ✅ ২. Search Filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          (a.name?.toLowerCase().includes(term) || '') ||
          (a.mobile?.toLowerCase().includes(term) || '') ||
          String(a.serialNo || '').includes(term) ||
          (a.doctorName?.toLowerCase().includes(term) || '') ||
          (a.id?.toLowerCase().includes(term) || '')
      );
    }

    // ✅ ৩. Officer Filter
    if (filterOfficer !== 'all') {
      filtered = filtered.filter((a) => a.marketingOfficer === filterOfficer);
    }

    // ✅ ৪. Status Filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }

    // ✅ ৫. Doctor Filter
    if (filterDoctor !== 'all') {
      filtered = filtered.filter((a) => a.doctorName === filterDoctor);
    }

    // ✅ ৬. Sort
    filtered = [...filtered].sort((a, b) => {
      if (isArchivedView) {
        const timeA =
          a.archivedAt?.toDate?.().getTime?.() ||
          (a.archivedAt ? new Date(a.archivedAt).getTime() : 0);
        const timeB =
          b.archivedAt?.toDate?.().getTime?.() ||
          (b.archivedAt ? new Date(b.archivedAt).getTime() : 0);
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      }
      const timeA = a.createdAt?.toDate
        ? a.createdAt.toDate().getTime()
        : a.timestamp
        ? new Date(a.timestamp).getTime()
        : 0;
      const timeB = b.createdAt?.toDate
        ? b.createdAt.toDate().getTime()
        : b.timestamp
        ? new Date(b.timestamp).getTime()
        : 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return filtered;
  }, [
    appointments,
    startDate,
    endDate,
    searchTerm,
    filterOfficer,
    filterStatus,
    filterDoctor,
    sortOrder,
    isArchivedView,
  ]);

  // ==================================================
  // ✅ Initial Load Detection
  // ==================================================
  useEffect(() => {
    if (appointments.length > 0) {
      setInitialLoadDone(true);
      return;
    }
    const timer = setTimeout(() => setInitialLoadDone(true), 800);
    return () => clearTimeout(timer);
  }, [appointments]);

  // ==================================================
  // ✅ Real-time Patients Subscription
  // ==================================================
  useEffect(() => {
    if (!hospitalId) return;
    invalidatePatientsCache();

    const unsub = subscribeToPatients(
      hospitalId,
      (patients) => {
        const map = {};
        (patients || []).forEach((p) => {
          map[p.id] = p;
        });
        setAllPatients(map);
      },
      (error) => {
        console.error('❌ Patients subscription error:', error);
      }
    );

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [hospitalId]);

  // ==================================================
  // ✅ Compute Patient Types
  // ==================================================
  useEffect(() => {
    if (!filteredAppointments.length) return;

    const types = {};
    for (const appt of filteredAppointments) {
      if (appt.patientTypeOverride) {
        types[appt.id] = appt.patientTypeOverride;
        continue;
      }
      if (userModifiedRef.current.has(appt.id)) continue;

      if (appt.patientId && Object.keys(allPatients).length > 0) {
        const patient = allPatients[appt.patientId];
        types[appt.id] = calculatePatientType(patient, appt);
      }
    }

    setPatientTypes((prev) => ({ ...prev, ...types }));
  }, [filteredAppointments, allPatients]);

  // ==================================================
  // ✅ Row Highlight Click
  // ==================================================
  const handleRowClick = async (apptId) => {
    if (!hospitalId) return;
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt || !appt.isNew || updatingHighlight) return;
    try {
      setUpdatingHighlight(apptId);
      await updateDoc(doc(db, 'hospitals', hospitalId, 'appointments', apptId), {
        isNew: false,
      });
    } catch (error) {
      console.error('Error removing highlight:', error);
    } finally {
      setUpdatingHighlight(null);
    }
  };

  // ==================================================
  // ✅ Confirm Modal Handlers
  // ==================================================
  const handleOpenConfirmModal = (appt) => {
    if (!canStatusChange) {
      alert('❌ আপনার status পরিবর্তন করার permission নেই।');
      return;
    }
    if (!hospitalId) {
      alert('হাসপাতাল আইডি পাওয়া যায়নি!');
      return;
    }
    setConfirmModalAppt(appt);
  };

  const handleConfirmSuccess = async () => {
    console.log('✅ Confirm modal success — refreshing data');
    try {
      if (onAppointmentsChange) {
        await onAppointmentsChange();
      }
    } catch (err) {
      console.error('Refresh error:', err);
    }
  };

  // ==================================================
  // ✅ Edit Booking Modal Handlers
  // ==================================================
  const handleOpenEditBookingModal = (appt) => {
    if (!canEdit && !canStatusChange) {
      alert('❌ আপনার বুকিং পরিবর্তন করার permission নেই।');
      return;
    }
    if (appt.status === 'completed' || appt.status === 'cancelled') {
      alert('❌ সম্পন্ন বা বাতিল করা বুকিং পরিবর্তন করা যায় না।');
      return;
    }
    setEditBookingModalAppt(appt);
  };

  const handleEditBookingSuccess = async () => {
    console.log('✅ Booking edited successfully');
    if (onAppointmentsChange) {
      await onAppointmentsChange();
    }
  };

  // ==================================================
  // ✅ Patient Type Change
  // ==================================================
  const handleManualCategoryChange = async (
    appointmentId,
    patientId,
    newCategory
  ) => {
    if (!canPatientTypeChange) {
      alert('❌ আপনার রোগীর টাইপ পরিবর্তন করার permission নেই।');
      return;
    }
    if (!hospitalId) {
      alert('হাসপাতাল আইডি পাওয়া যায়নি!');
      return;
    }

    const oldCategory = patientTypes[appointmentId] || '—';
    const appointment = appointments.find((a) => a.id === appointmentId);

    if (!appointment) {
      alert('অ্যাপয়েন্টমেন্ট পাওয়া যায়নি।');
      return;
    }

    userModifiedRef.current.add(appointmentId);
    setTimeout(() => {
      userModifiedRef.current.delete(appointmentId);
    }, 8000);

    setPatientTypes((prev) => ({ ...prev, [appointmentId]: newCategory }));

    try {
      setUpdatingPatient(appointmentId);
      const now = new Date().toISOString();

      const appointmentRef = doc(
        db,
        'hospitals',
        hospitalId,
        'appointments',
        appointmentId
      );

      await updateDoc(appointmentRef, {
        patientTypeOverride: newCategory,
        patientTypeOverrideAt: now,
        patientTypeOverrideBy: user?.uid || user?.id || null,
      });

      if (patientId) {
        try {
          const patientRef = doc(db, 'hospitals', hospitalId, 'patients', patientId);
          const patientSnap = await getDoc(patientRef);

          if (patientSnap.exists()) {
            const patient = patientSnap.data();
            let visits = Array.isArray(patient.visits) ? [...patient.visits] : [];
            const doctorName = appointment.doctorName || '';

            if (doctorName) {
              if (newCategory === 'নতুন') {
                visits = visits.filter((v) => v.doctorName !== doctorName);
              } else if (newCategory === 'রিপোর্ট') {
                const doctorVisits = visits.filter((v) => v.doctorName === doctorName);
                if (doctorVisits.length === 0) {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  visits.push({
                    doctorName,
                    date: yesterday.toISOString().split('T')[0],
                  });
                }
              } else if (newCategory === 'ফলোআপ') {
                const doctorVisits = visits.filter((v) => v.doctorName === doctorName);
                if (doctorVisits.length === 0) {
                  const eightDaysAgo = new Date();
                  eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
                  visits.push({
                    doctorName,
                    date: eightDaysAgo.toISOString().split('T')[0],
                  });
                }
              }

              await updateDoc(patientRef, { visits, updatedAt: now });
              invalidatePatientsCache();
            }
          }
        } catch (patientErr) {
          console.warn('⚠️ Patient update failed (non-critical):', patientErr);
        }
      }

      try {
        await logActivity({
          hospitalId,
          module: LOG_MODULES.BOOKING,
          action: LOG_ACTIONS.PATIENT_TYPE_CHANGE,
          recordId: appointmentId,
          description: `${appointment.name || 'রোগী'} এর ধরন পরিবর্তন: ${oldCategory} → ${newCategory}`,
          oldValue: oldCategory,
          newValue: newCategory,
          user,
        });
      } catch (logErr) {
        console.error('Patient type log error:', logErr);
      }

      if (onAppointmentsChange) {
        try {
          await onAppointmentsChange();
        } catch (e) {
          console.error(e);
        }
      }
    } catch (error) {
      console.error('❌ Error updating patient category:', error);
      alert('রোগীর টাইপ পরিবর্তন করতে সমস্যা হয়েছে: ' + error.message);
      setPatientTypes((prev) => ({ ...prev, [appointmentId]: oldCategory }));
    } finally {
      setUpdatingPatient(null);
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilterOfficer('all');
    setFilterStatus('all');
    setFilterDoctor('all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
  };

  // ==================================================
  // ✅ Edit (inline — referral/remarks/officer)
  // ==================================================
  const startEdit = (appt) => {
    if (!canEdit && !canReferralEdit && !canMarketingAssign) {
      alert('❌ আপনার edit permission নেই।');
      return;
    }
    setEditingId(appt.id);
    setEditData({
      referralSource: appt.referralSource || '',
      marketingOfficer: appt.marketingOfficer || '',
      marketingOfficerId: appt.marketingOfficerId || '',
      remarks: appt.remarks || '',
    });
  };

  const saveEdit = async (id) => {
    if (!hospitalId) {
      alert('হাসপাতাল আইডি পাওয়া যায়নি!');
      return;
    }
    const oldAppt = appointments.find((a) => a.id === id);
    if (!oldAppt) {
      alert('অ্যাপয়েন্টমেন্ট পাওয়া যায়নি');
      return;
    }

    try {
      const updates = {};

      if (canReferralEdit) {
        if ((oldAppt.referralSource || '') !== (editData.referralSource || '')) {
          updates.referralSource = editData.referralSource;
        }
        if ((oldAppt.remarks || '') !== (editData.remarks || '')) {
          updates.remarks = editData.remarks;
        }
      }

      if (canMarketingAssign) {
        const oldOffId = oldAppt.marketingOfficerId || '';
        const newOffId = editData.marketingOfficerId || '';
        if (oldOffId !== newOffId) {
          updates.marketingOfficer = editData.marketingOfficer;
          updates.marketingOfficerId = newOffId || null;
        }
      }

      if (Object.keys(updates).length === 0) {
        setEditingId(null);
        return;
      }

      await updateDoc(doc(db, 'hospitals', hospitalId, 'appointments', id), updates);

      setEditingId(null);

      if (onAppointmentsChange) {
        try {
          await onAppointmentsChange();
        } catch (e) {
          console.error(e);
        }
      }

      alert('✅ আপডেট সফল হয়েছে!');
    } catch (error) {
      console.error('Save edit error:', error);
      alert('আপডেট করতে সমস্যা হয়েছে।');
    }
  };

  const cancelEdit = () => setEditingId(null);

  const handleDropdownChange = (id, newStatus) => {
    if (!canStatusChange) {
      alert('❌ আপনার status পরিবর্তন করার permission নেই।');
      return;
    }

    // ✅ যদি 'confirmed' সিলেক্ট করে, তাহলে Confirm Modal খুলব
    if (newStatus === 'confirmed') {
      const appt = filteredAppointments.find((a) => a.id === id);
      if (appt) {
        handleOpenConfirmModal(appt);
      }
      return;
    }

    const appt = filteredAppointments.find((a) => a.id === id);
    if (appt) {
      if (
        validTransitions[appt.status] &&
        validTransitions[appt.status].includes(newStatus)
      ) {
        onStatusChange(id, newStatus);
      } else {
        alert('Invalid Status Transition!');
      }
    }
  };

  // ==================================================
  // ✅ Print
  // ==================================================
  const printDoctorWise = (doctorName, patients) => {
    if (!canPrint) {
      alert('❌ আপনার print করার permission নেই।');
      return;
    }
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      alert('পপ-আপ ব্লকার সক্রিয় থাকতে পারে।');
      return;
    }

    const sortedPatients = [...patients].sort(
      (a, b) => Number(a.serialNo) - Number(b.serialNo)
    );

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${doctorName} - রোগীর তালিকা</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif; padding: 30px; background: #fff; color: #1e293b; }
            .print-header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #1c5fa8; padding-bottom: 15px; }
            .print-header h1 { color: #1c5fa8; font-size: 24px; margin-bottom: 5px; }
            .print-header .sub { color: #475569; font-size: 14px; }
            .print-date { text-align: right; font-size: 13px; color: #64748b; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 14px; }
            th { background: #1c5fa8; color: #fff; padding: 10px 12px; text-align: left; font-weight: 700; }
            td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div style="text-align:right;margin-bottom:15px;">
            <button onclick="window.print()" style="padding:8px 20px;background:#1c5fa8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ প্রিন্ট করুন</button>
            <button onclick="window.close()" style="padding:8px 20px;background:#e2e8f0;color:#1e293b;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-left:10px;">বন্ধ করুন</button>
          </div>
          <div class="print-header">
            <h1>${doctorName}</h1>
            <div class="sub">রোগীর বুকিং তালিকা</div>
          </div>
          <div class="print-date">প্রিন্ট তারিখ: ${new Date().toLocaleString('bn-BD')}</div>
          <table>
            <thead><tr><th>সিরিয়াল</th><th>রোগীর নাম</th><th>মোবাইল</th><th>বুকিং তারিখ</th><th>স্ট্যাটাস</th></tr></thead>
            <tbody>
              ${sortedPatients
                .map(
                  (appt) => `
                <tr>
                  <td>${appt.serialNo || '-'}</td>
                  <td>${appt.name || '-'}</td>
                  <td>${appt.mobile || '-'}</td>
                  <td>${appt.bookingDate || '-'}</td>
                  <td>${appt.status || 'pending'}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          <div class="footer">মোট রোগী: ${sortedPatients.length} জন</div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const doctorWiseData = {};
  filteredAppointments.forEach((appt) => {
    const doctorName = appt.doctorName || 'Unknown Doctor';
    if (!doctorWiseData[doctorName])
      doctorWiseData[doctorName] = { dept: appt.doctorDept || '', patients: [] };
    doctorWiseData[doctorName].patients.push(appt);
  });

  // ==================================================
  // ✅ QR View
  // ==================================================
  const handleShowQR = (appointmentId) => {
    if (!canQR) {
      alert('❌ আপনার QR কোড দেখার permission নেই।');
      return;
    }
    if (!appointmentId) {
      alert('অ্যাপয়েন্টমেন্ট আইডি পাওয়া যায়নি');
      return;
    }
    const url = `${window.location.origin}/checkin/${appointmentId}`;
    window.open(url, '_blank');
  };

  // ==================================================
  // ✅ Render Actions
  // ==================================================
  const renderActions = (appt) => {
    const actions = [];

    // View details
    actions.push(
      <ActionButton
        key="view"
        onClick={() => setViewDetails(appt)}
        title="বিস্তারিত দেখুন"
        bg="#64748b"
        icon={<Eye size={14} />}
      />
    );

    if (isArchivedView) {
      if (canRestore) {
        actions.push(
          <ActionButton
            key="restore"
            onClick={() => onRestore(appt.id)}
            title="Restore করুন"
            bg="#2f9e52"
            icon={<Undo2 size={14} />}
          />
        );
      }
      if (canPermanentDelete) {
        actions.push(
          <ActionButton
            key="permadelete"
            onClick={() => onPermanentDelete(appt.id)}
            title="স্থায়ীভাবে মুছুন"
            bg="#dc2626"
            icon={<Trash2 size={14} />}
          />
        );
      }
      return actions;
    }

    const currentStatus = appt.status || 'pending';
    const nextStatuses = validTransitions[currentStatus] || [];

    // ✅ Edit Booking button (date/doctor change)
    if (
      (canEdit || canStatusChange) &&
      currentStatus !== 'completed' &&
      currentStatus !== 'cancelled'
    ) {
      actions.push(
        <ActionButton
          key="editBooking"
          onClick={() => handleOpenEditBookingModal(appt)}
          title="তারিখ/ডাক্তার পরিবর্তন করুন"
          bg="#0891b2"
          icon={<Calendar size={14} />}
        />
      );
    }

    // QR button
    if ((currentStatus === 'pending' || currentStatus === 'confirmed') && canQR) {
      actions.push(
        <ActionButton
          key="qr"
          onClick={() => handleShowQR(appt.id)}
          title="QR কোড দেখুন"
          bg="#8b5cf6"
          icon={<QrCode size={14} />}
        />
      );
    }

    if (canStatusChange) {
      if (currentStatus === 'pending') {
        actions.push(
          <ActionButton
            key="confirm"
            onClick={() => handleOpenConfirmModal(appt)}
            title="Confirm করুন (মেসেজ এডিটসহ)"
            bg="#3b82f6"
            icon={<CheckCircle size={14} />}
          />
        );
        actions.push(
          <ActionButton
            key="cancel"
            onClick={() => onStatusChange(appt.id, 'cancelled')}
            title="Cancel করুন"
            bg="#d97706"
            icon={<XCircle size={14} />}
          />
        );
      } else if (currentStatus === 'confirmed') {
        actions.push(
          <ActionButton
            key="checkin"
            onClick={() => onStatusChange(appt.id, 'checked-in')}
            title="Checked-in করুন"
            bg="#8b5cf6"
            icon={<UserCheck size={14} />}
          />
        );
        actions.push(
          <ActionButton
            key="cancel"
            onClick={() => onStatusChange(appt.id, 'cancelled')}
            title="Cancel করুন"
            bg="#d97706"
            icon={<XCircle size={14} />}
          />
        );
        actions.push(
          <ActionButton
            key="noshow"
            onClick={() => onStatusChange(appt.id, 'no-show')}
            title="No-show করুন"
            bg="#6b7280"
            icon={<Clock size={14} />}
          />
        );
      } else if (currentStatus === 'checked-in') {
        actions.push(
          <ActionButton
            key="complete"
            onClick={() => onStatusChange(appt.id, 'completed')}
            title="Completed করুন"
            bg="#22c55e"
            icon={<CheckCircle size={14} />}
          />
        );
      }
    }

    if (canArchive) {
      actions.push(
        <ActionButton
          key="archive"
          onClick={() => onArchive(appt.id)}
          title="আর্কাইভ করুন"
          bg="#d97706"
          icon={<Archive size={14} />}
        />
      );
    }

    if (canStatusChange && nextStatuses.length > 0) {
      actions.push(
        <select
          key="dropdown"
          value=""
          onChange={(e) => handleDropdownChange(appt.id, e.target.value)}
          style={{
            padding: '5px',
            borderRadius: '5px',
            border: '1px solid #e2e8f0',
            fontSize: '12px',
            color: '#334155',
            background: '#ffffff',
          }}
        >
          <option value="" disabled>
            -- Manually Set --
          </option>
          {nextStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replace('-', ' ')}
            </option>
          ))}
        </select>
      );
    }

    return actions;
  };

  if (!canView) {
    return (
      <div
        style={{
          background: '#fff',
          padding: '60px 20px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🚫</div>
        <h3 style={{ color: '#dc2626', marginBottom: '8px' }}>Access Denied</h3>
        <p style={{ color: '#64748b' }}>
          আপনার বুকিং লিস্ট দেখার permission নেই।
        </p>
      </div>
    );
  }

  // ==================================================
  // ✅ RENDER
  // ==================================================
  return (
    <div
      className={initialLoadDone ? 'content-fade-in' : ''}
      style={{
        background: '#ffffff',
        borderRadius: '10px',
        padding: '20px',
        width: '100%',
        overflowX: 'auto',
        color: '#1f2937',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#1f2937' }}>
            {isArchivedView ? '📦 আর্কাইভ করা বুকিং' : 'রোগীর বুকিং লিস্ট'}
          </h3>
          {isArchivedView && (
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              শুধুমাত্র আর্কাইভ করা বুকিংগুলো এখানে সংরক্ষিত থাকবে।
            </p>
          )}
        </div>
      </div>

      {/* Date Filter Section */}
      {!isArchivedView && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '15px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '10px',
            }}
          >
            <Calendar size={16} color="#1c5fa8" />
            <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>
              তারিখ অনুযায়ী ফিল্টার
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '12px',
            }}
          >
            {[
              { key: 'all', label: 'সব' },
              { key: 'today', label: 'আজ' },
              { key: 'week', label: 'গত ৭ দিন' },
              { key: 'month', label: 'গত ১ মাস' },
              { key: 'year', label: 'গত ১ বছর' },
              { key: 'custom', label: 'কাস্টম' },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => applyDatePreset(p.key)}
                style={{
                  padding: '6px 14px',
                  background: datePreset === p.key ? '#1c5fa8' : '#fff',
                  color: datePreset === p.key ? '#fff' : '#334155',
                  border: '1px solid ' + (datePreset === p.key ? '#1c5fa8' : '#cbd5e1'),
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  marginBottom: '4px',
                }}
              >
                শুরু তারিখ
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset('custom');
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: '#fff',
                  color: '#1e293b',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  marginBottom: '4px',
                }}
              >
                শেষ তারিখ
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset('custom');
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: '#fff',
                  color: '#1e293b',
                }}
              />
            </div>

            {(startDate || endDate) && (
              <div
                style={{
                  background: '#dbeafe',
                  color: '#1e40af',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                📅{' '}
                {startDate && endDate
                  ? `${startDate} → ${endDate}`
                  : startDate
                  ? `${startDate} থেকে`
                  : `${endDate} পর্যন্ত`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Filter Row */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '15px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#f1f5f9',
            borderRadius: '8px',
            padding: '4px 10px',
          }}
        >
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="নাম, মোবাইল, সিরিয়াল..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              padding: '6px',
              fontSize: '13px',
              width: '180px',
            }}
          />
        </div>

        {!isArchivedView && (
          <select
            value={filterOfficer}
            onChange={(e) => setFilterOfficer(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#fff',
            }}
          >
            <option value="all">সব অফিসার</option>
            {marketingTeam.map((m, idx) => {
              const name = typeof m === 'string' ? m : m.name;
              const key = typeof m === 'string' ? idx : m.id || idx;
              return (
                <option key={key} value={name}>
                  {name}
                </option>
              );
            })}
          </select>
        )}

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '13px',
            background: '#fff',
          }}
        >
          <option value="all">সব স্ট্যাটাস</option>
          {uniqueStatuses
            .filter((s) => s !== 'all')
            .map((s) => (
              <option key={s} value={s}>
                {s.replace('-', ' ')}
              </option>
            ))}
        </select>

        <select
          value={filterDoctor}
          onChange={(e) => setFilterDoctor(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '13px',
            background: '#fff',
          }}
        >
          <option value="all">সব ডাক্তার</option>
          {uniqueDoctors
            .filter((d) => d !== 'all')
            .map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
        </select>

        <button
          onClick={resetFilters}
          style={{
            padding: '6px 12px',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <XCircleIcon size={14} /> রিসেট
        </button>

        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          style={{
            padding: '6px 12px',
            background: '#e2e8f0',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <ArrowUpDown size={14} />{' '}
          {sortOrder === 'asc' ? 'পুরনো→নতুন' : 'নতুন→পুরনো'}
        </button>

        {!isArchivedView && (
          <div
            style={{
              display: 'flex',
              gap: '5px',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '8px',
            }}
          >
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'list' ? '#1c5fa8' : 'transparent',
                color: viewMode === 'list' ? '#fff' : '#475569',
                fontWeight: '600',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <LayoutList size={14} /> সাধারণ
            </button>
            <button
              onClick={() => setViewMode('doctor')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'doctor' ? '#1c5fa8' : 'transparent',
                color: viewMode === 'doctor' ? '#fff' : '#475569',
                fontWeight: '600',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Stethoscope size={14} /> ডাক্তার ওয়াইজ
            </button>
          </div>
        )}
      </div>

      {/* Active Filter Indicators */}
      {(filterOfficer !== 'all' ||
        filterStatus !== 'all' ||
        filterDoctor !== 'all' ||
        searchTerm ||
        startDate ||
        endDate) && (
        <div
          style={{
            fontSize: '13px',
            color: '#64748b',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <Filter size={14} />
          <span>ফিল্টার:</span>
          {startDate && (
            <span
              style={{
                background: '#dbeafe',
                padding: '2px 10px',
                borderRadius: '12px',
                color: '#1e40af',
                fontWeight: '600',
              }}
            >
              📅 {startDate}
              {endDate ? ` → ${endDate}` : ''}
            </span>
          )}
          {filterOfficer !== 'all' && (
            <span
              style={{
                background: '#eef1f7',
                padding: '2px 10px',
                borderRadius: '12px',
              }}
            >
              অফিসার: {filterOfficer}
            </span>
          )}
          {filterStatus !== 'all' && (
            <span
              style={{
                background: '#eef1f7',
                padding: '2px 10px',
                borderRadius: '12px',
              }}
            >
              স্ট্যাটাস: {filterStatus}
            </span>
          )}
          {filterDoctor !== 'all' && (
            <span
              style={{
                background: '#eef1f7',
                padding: '2px 10px',
                borderRadius: '12px',
              }}
            >
              ডাক্তার: {filterDoctor}
            </span>
          )}
          {searchTerm && (
            <span
              style={{
                background: '#eef1f7',
                padding: '2px 10px',
                borderRadius: '12px',
              }}
            >
              সার্চ: {searchTerm}
            </span>
          )}
          <span
            style={{
              marginLeft: '10px',
              fontWeight: '700',
              color: '#1c5fa8',
            }}
          >
            মোট: {filteredAppointments.length}টি
          </span>
        </div>
      )}

      {/* Table / Skeleton / Empty */}
      {!initialLoadDone ? (
        <AppointmentsTableSkeleton rows={isArchivedView ? 5 : 8} />
      ) : appointments.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          {isArchivedView ? (
            <>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div>
              <p
                style={{
                  fontWeight: '600',
                  fontSize: '16px',
                  color: '#475569',
                }}
              >
                কোনো আর্কাইভ করা বুকিং নেই
              </p>
            </>
          ) : (
            <p>📭 এখনো কোনো অ্যাপয়েন্টমেন্ট নেই।</p>
          )}
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
            background: '#f8fafc',
            borderRadius: '10px',
            border: '1px dashed #cbd5e1',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
          <p
            style={{
              fontWeight: '600',
              fontSize: '16px',
              color: '#475569',
            }}
          >
            এই ফিল্টারে কোনো বুকিং পাওয়া যায়নি
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
            তারিখ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।
          </p>
          <button
            onClick={resetFilters}
            style={{
              marginTop: '16px',
              padding: '8px 20px',
              background: '#1c5fa8',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
            }}
          >
            সব ফিল্টার রিসেট করুন
          </button>
        </div>
      ) : viewMode === 'list' || isArchivedView ? (
        // ============ LIST VIEW ============
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: isArchivedView ? '1100px' : '1400px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#eef1f7',
                  textAlign: 'left',
                  color: '#1f2937',
                }}
              >
                <th style={{ padding: '12px' }}>সিরিয়াল</th>
                <th style={{ padding: '12px' }}>রোগীর নাম</th>
                <th style={{ padding: '12px' }}>বয়স</th>
                <th style={{ padding: '12px' }}>মোবাইল</th>
                <th style={{ padding: '12px' }}>বুকিং তারিখ</th>
                <th style={{ padding: '12px' }}>ডাক্তার</th>
                <th style={{ padding: '12px' }}>রেফারেল</th>
                {!isArchivedView && (
                  <th style={{ padding: '12px' }}>মার্কেটিং অফিসার</th>
                )}
                <th style={{ padding: '12px' }}>রোগীর টাইপ</th>
                {!isArchivedView && <th style={{ padding: '12px' }}>রিমার্কস</th>}
                <th style={{ padding: '12px' }}>স্ট্যাটাস</th>
                {isArchivedView && (
                  <th style={{ padding: '12px' }}>আর্কাইভের তারিখ</th>
                )}
                <th style={{ padding: '12px' }}>অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appt) => {
                const isEditing = editingId === appt.id;
                const patientType = patientTypes[appt.id] || 'লোড হচ্ছে...';
                const isUpdating = updatingPatient === appt.id;
                const isNew = appt.isNew === true && !isArchivedView;

                const archivedDate = appt.archivedAt?.toDate
                  ? appt.archivedAt.toDate().toLocaleDateString('bn-BD')
                  : appt.archivedAt
                  ? new Date(appt.archivedAt).toLocaleDateString('bn-BD')
                  : '-';

                return (
                  <tr
                    key={appt.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      color: '#334155',
                      background: isNew ? '#f0fdf4' : 'transparent',
                      transition: 'background 0.3s ease',
                      cursor: isNew ? 'pointer' : 'default',
                    }}
                    onClick={() => isNew && handleRowClick(appt.id)}
                    title={isNew ? 'হাইলাইট সরাতে ক্লিক করুন' : ''}
                  >
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>
                      {appt.serialNo}
                      {isNew && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '10px',
                            color: '#16a34a',
                            fontWeight: 'normal',
                          }}
                        >
                          ● নতুন
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>{appt.name}</td>
                    <td style={{ padding: '12px' }}>{appt.age || '-'}</td>
                    <td style={{ padding: '12px' }}>{appt.mobile}</td>
                    <td style={{ padding: '12px' }}>
                      {appt.bookingDate} ({appt.bookingDay})
                    </td>
                    <td style={{ padding: '12px' }}>
                      {appt.doctorName}
                      <br />
                      <small style={{ color: '#64748b' }}>{appt.doctorDept}</small>
                      {appt.doctorTime && (
                        <>
                          <br />
                          <small
                            style={{
                              color: '#b45309',
                              fontWeight: '500',
                            }}
                          >
                            ⏱ {appt.doctorTime}
                          </small>
                        </>
                      )}
                    </td>

                    <td style={{ padding: '12px' }}>
                      {isEditing && canReferralEdit && !isArchivedView ? (
                        <select
                          value={editData.referralSource}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              referralSource: e.target.value,
                            })
                          }
                          style={{
                            padding: '4px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            width: '100%',
                          }}
                        >
                          {REFERRAL_SOURCES.map((src) => (
                            <option key={src} value={src}>
                              {src}
                            </option>
                          ))}
                        </select>
                      ) : (
                        appt.referralSource || '-'
                      )}
                    </td>

                    {!isArchivedView && (
                      <td style={{ padding: '12px' }}>
                        {isEditing && canMarketingAssign ? (
                          <select
                            value={editData.marketingOfficerId || ''}
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              const officer = marketingTeam.find((m) => {
                                const id = typeof m === 'string' ? m : m.id || m.name;
                                return id === selectedId;
                              });
                              const officerName = officer
                                ? typeof officer === 'string'
                                  ? officer
                                  : officer.name
                                : '';
                              setEditData({
                                ...editData,
                                marketingOfficerId: selectedId || '',
                                marketingOfficer: officerName,
                              });
                            }}
                            style={{
                              padding: '4px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              width: '100%',
                            }}
                          >
                            <option value="">নির্বাচন করুন</option>
                            {marketingTeam.map((m, idx) => {
                              const name = typeof m === 'string' ? m : m.name;
                              const id = typeof m === 'string' ? m : m.id || m.name;
                              const key = typeof m === 'string' ? idx : m.id || idx;
                              return (
                                <option key={key} value={id}>
                                  {name}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span style={{ fontWeight: '500' }}>
                            {appt.marketingOfficer || (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </span>
                        )}
                      </td>
                    )}

                    <td style={{ padding: '12px' }}>
                      {canPatientTypeChange && appt.patientId && !isArchivedView ? (
                        <select
                          value={patientType}
                          onChange={(e) =>
                            handleManualCategoryChange(
                              appt.id,
                              appt.patientId,
                              e.target.value
                            )
                          }
                          disabled={isUpdating}
                          style={{
                            padding: '8px 18px 8px 16px',
                            borderRadius: '24px',
                            fontSize: '13px',
                            fontWeight: '600',
                            border: '1px solid #e2e8f0',
                            background:
                              patientType === 'নতুন'
                                ? '#dcfce7'
                                : patientType === 'রিপোর্ট'
                                ? '#fef3c7'
                                : patientType === 'ফলোআপ'
                                ? '#dbeafe'
                                : '#f1f5f9',
                            color:
                              patientType === 'নতুন'
                                ? '#166534'
                                : patientType === 'রিপোর্ট'
                                ? '#92400e'
                                : patientType === 'ফলোআপ'
                                ? '#1e40af'
                                : '#64748b',
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                            minWidth: '130px',
                            outline: 'none',
                          }}
                        >
                          <option value="নতুন">নতুন</option>
                          <option value="রিপোর্ট">রিপোর্ট</option>
                          <option value="ফলোআপ">ফলোআপ</option>
                        </select>
                      ) : (
                        <span
                          style={{
                            background:
                              patientType === 'নতুন'
                                ? '#dcfce7'
                                : patientType === 'রিপোর্ট'
                                ? '#fef3c7'
                                : patientType === 'ফলোআপ'
                                ? '#dbeafe'
                                : '#f1f5f9',
                            color:
                              patientType === 'নতুন'
                                ? '#166534'
                                : patientType === 'রিপোর্ট'
                                ? '#92400e'
                                : patientType === 'ফলোআপ'
                                ? '#1e40af'
                                : '#64748b',
                            padding: '6px 16px',
                            borderRadius: '24px',
                            fontSize: '13px',
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }}
                        >
                          {patientType}
                        </span>
                      )}
                    </td>

                    {!isArchivedView && (
                      <td style={{ padding: '12px', minWidth: '150px' }}>
                        {isEditing && canReferralEdit ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              alignItems: 'center',
                            }}
                          >
                            <input
                              type="text"
                              value={editData.remarks || ''}
                              onChange={(e) =>
                                setEditData({
                                  ...editData,
                                  remarks: e.target.value,
                                })
                              }
                              placeholder="রিমার্কস লিখুন"
                              style={{
                                padding: '4px 8px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                flex: '1',
                                fontSize: '13px',
                              }}
                            />
                            <button
                              onClick={() => saveEdit(appt.id)}
                              style={{
                                background: '#22c55e',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{
                                background: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span style={{ fontSize: '13px' }}>
                              {appt.remarks || '-'}
                            </span>
                            {(canEdit || canReferralEdit || canMarketingAssign) && (
                              <button
                                onClick={() => startEdit(appt)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#64748b',
                                }}
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}

                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={appt.status || 'pending'} />
                    </td>

                    {isArchivedView && (
                      <td
                        style={{
                          padding: '12px',
                          fontSize: '13px',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {archivedDate}
                      </td>
                    )}

                    <td
                      style={{
                        padding: '12px',
                        display: 'flex',
                        gap: '5px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {renderActions(appt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // ============ DOCTOR-WISE VIEW ============
        <div>
          {Object.keys(doctorWiseData).length === 0 ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              কোনো বুকিং পাওয়া যায়নি
            </div>
          ) : (
            Object.entries(doctorWiseData).map(([doctorName, info]) => (
              <div
                key={doctorName}
                style={{
                  marginBottom: '20px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '12px 15px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ color: '#1c5fa8', fontSize: '16px' }}>
                    {doctorName}
                  </strong>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        background: '#0d9488',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        fontWeight: '700',
                      }}
                    >
                      মোট: {info.patients.length} জন
                    </span>
                    {canPrint && (
                      <button
                        onClick={() => printDoctorWise(doctorName, info.patients)}
                        style={{
                          background: '#1c5fa8',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 12px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Printer size={15} /> প্রিন্ট
                      </button>
                    )}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr
                      style={{
                        background: '#f1f5f9',
                        textAlign: 'left',
                        fontSize: '13px',
                      }}
                    >
                      <th style={{ padding: '8px 12px' }}>সিরিয়াল</th>
                      <th style={{ padding: '8px 12px' }}>রোগীর নাম</th>
                      <th style={{ padding: '8px 12px' }}>বয়স</th>
                      <th style={{ padding: '8px 12px' }}>মোবাইল</th>
                      <th style={{ padding: '8px 12px' }}>বুকিং তারিখ</th>
                      <th style={{ padding: '8px 12px' }}>রেফারেল</th>
                      <th style={{ padding: '8px 12px' }}>মার্কেটিং অফিসার</th>
                      <th style={{ padding: '8px 12px' }}>রোগীর টাইপ</th>
                      <th style={{ padding: '8px 12px' }}>রিমার্কস</th>
                      <th style={{ padding: '8px 12px' }}>স্ট্যাটাস</th>
                      <th style={{ padding: '8px 12px' }}>অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.patients.map((appt) => {
                      const patientType = patientTypes[appt.id] || 'লোড হচ্ছে...';
                      const isUpdating = updatingPatient === appt.id;
                      const isNew = appt.isNew === true;

                      return (
                        <tr
                          key={appt.id}
                          style={{
                            borderBottom: '1px solid #eee',
                            fontSize: '14px',
                            background: isNew ? '#f0fdf4' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>
                            {appt.serialNo}
                          </td>
                          <td style={{ padding: '10px 12px' }}>{appt.name}</td>
                          <td style={{ padding: '10px 12px' }}>{appt.age || '-'}</td>
                          <td style={{ padding: '10px 12px' }}>{appt.mobile}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {appt.bookingDate} ({appt.bookingDay})
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {appt.referralSource || '-'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {appt.marketingOfficer || '-'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {canPatientTypeChange && appt.patientId ? (
                              <select
                                value={patientType}
                                onChange={(e) =>
                                  handleManualCategoryChange(
                                    appt.id,
                                    appt.patientId,
                                    e.target.value
                                  )
                                }
                                disabled={isUpdating}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  border: '1px solid #cbd5e1',
                                  background:
                                    patientType === 'নতুন'
                                      ? '#dcfce7'
                                      : patientType === 'রিপোর্ট'
                                      ? '#fef3c7'
                                      : patientType === 'ফলোআপ'
                                      ? '#dbeafe'
                                      : '#f1f5f9',
                                  color:
                                    patientType === 'নতুন'
                                      ? '#166534'
                                      : patientType === 'রিপোর্ট'
                                      ? '#92400e'
                                      : patientType === 'ফলোআপ'
                                      ? '#1e40af'
                                      : '#64748b',
                                  cursor: isUpdating ? 'not-allowed' : 'pointer',
                                  minWidth: '100px',
                                }}
                              >
                                <option value="নতুন">নতুন</option>
                                <option value="রিপোর্ট">রিপোর্ট</option>
                                <option value="ফলোআপ">ফলোআপ</option>
                              </select>
                            ) : (
                              <span
                                style={{
                                  background:
                                    patientType === 'নতুন'
                                      ? '#dcfce7'
                                      : patientType === 'রিপোর্ট'
                                      ? '#fef3c7'
                                      : patientType === 'ফলোআপ'
                                      ? '#dbeafe'
                                      : '#f1f5f9',
                                  color:
                                    patientType === 'নতুন'
                                      ? '#166534'
                                      : patientType === 'রিপোর্ট'
                                      ? '#92400e'
                                      : patientType === 'ফলোআপ'
                                      ? '#1e40af'
                                      : '#64748b',
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {patientType}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {appt.remarks || '-'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge status={appt.status || 'pending'} />
                          </td>
                          <td
                            style={{
                              padding: '10px 12px',
                              display: 'flex',
                              gap: '5px',
                              flexWrap: 'wrap',
                            }}
                          >
                            {renderActions(appt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* ============ Details Modal ============ */}
      {viewDetails && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setViewDetails(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              padding: '24px',
              position: 'relative',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewDetails(null)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              ✕
            </button>
            <h3
              style={{
                marginTop: 0,
                color: '#1c5fa8',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '10px',
              }}
            >
              {isArchivedView ? '📦 আর্কাইভকৃত বুকিং বিস্তারিত' : 'রোগীর বিস্তারিত তথ্য'}
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '15px',
              }}
            >
              <div>
                <strong>নাম:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.name}</span>
              </div>
              <div>
                <strong>বয়স:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.age || '-'}</span>
              </div>
              <div>
                <strong>মোবাইল:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.mobile}</span>
              </div>
              <div>
                <strong>লিঙ্গ:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.gender || '-'}</span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>ঠিকানা:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.address || '-'}</span>
              </div>
              <div>
                <strong>বুকিং তারিখ:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>
                  {viewDetails.bookingDate} ({viewDetails.bookingDay})
                </span>
              </div>
              <div>
                <strong>সিরিয়াল:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.serialNo}</span>
              </div>
              <div>
                <strong>ডাক্তার:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.doctorName}</span>
              </div>
              <div>
                <strong>বিভাগ:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.doctorDept}</span>
              </div>
              <div>
                <strong>সময়:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>
                  {viewDetails.doctorTime || '-'}
                </span>
              </div>
              <div>
                <strong>রেফারেল সোর্স:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>
                  {viewDetails.referralSource || '-'}
                </span>
              </div>
              {viewDetails.referredDoctorName && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong>রেফারিং ডাক্তার:</strong>
                  <br />
                  <span style={{ fontWeight: '700' }}>
                    {viewDetails.referredDoctorName}
                  </span>
                </div>
              )}
              <div>
                <strong>মার্কেটিং অফিসার:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>
                  {viewDetails.marketingOfficer || '-'}
                </span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>রোগীর টাইপ:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>
                  {viewDetails.patientTypeOverride ||
                    patientTypes[viewDetails.id] ||
                    'অজানা'}
                </span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>রিমার্কস:</strong>
                <br />
                <span style={{ fontWeight: '700' }}>{viewDetails.remarks || '-'}</span>
              </div>
              {viewDetails.confirmNote && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong style={{ color: '#d97706' }}>📌 কনফার্ম নোট:</strong>
                  <br />
                  <span style={{ fontWeight: '700', color: '#92400e' }}>
                    {viewDetails.confirmNote}
                  </span>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>স্ট্যাটাস:</strong>
                <br />
                <StatusBadge status={viewDetails.status || 'pending'} />
              </div>

              {isArchivedView && (
                <>
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: '8px',
                      borderTop: '1px solid #e2e8f0',
                      paddingTop: '12px',
                    }}
                  >
                    <strong style={{ color: '#d97706' }}>📦 আর্কাইভ তথ্য</strong>
                  </div>
                  <div>
                    <strong>আর্কাইভের তারিখ:</strong>
                    <br />
                    <span style={{ fontWeight: '700' }}>
                      {viewDetails.archivedAt?.toDate
                        ? viewDetails.archivedAt.toDate().toLocaleString('bn-BD')
                        : viewDetails.archivedAt
                        ? new Date(viewDetails.archivedAt).toLocaleString('bn-BD')
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <strong>আর্কাইভ করেছেন:</strong>
                    <br />
                    <span style={{ fontWeight: '700' }}>
                      {viewDetails.archivedByName || viewDetails.archivedBy || '-'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          ✅ Confirm Message Modal
          ========================================== */}
      {confirmModalAppt && (
        <ConfirmMessageModal
          appointment={confirmModalAppt}
          hospitalId={hospitalId}
          onClose={() => setConfirmModalAppt(null)}
          onSuccess={handleConfirmSuccess}
        />
      )}

      {/* ==========================================
          ✅ Edit Booking Modal (date/doctor change)
          ========================================== */}
      {editBookingModalAppt && (
        <EditBookingModal
          appointment={editBookingModalAppt}
          departments={departments}
          panels={panels}
          onClose={() => setEditBookingModalAppt(null)}
          onSuccess={handleEditBookingSuccess}
        />
      )}
    </div>
  );
}