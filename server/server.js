// server.js
// ==================================================
// 🏥 আল-আফিয়া হাসপাতাল — Backend Server
// ==================================================
// ✅ WhatsApp via Baileys
// ✅ SMS via sms.net.bd (English only)
// ✅ Email via Gmail
// ✅ FCM Push Notifications
// ✅ Uses nameEn / doctorNameEn (no transliteration needed)
// ✅ Custom Confirm Message API
// ==================================================
require('dotenv').config();
const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const axios = require('axios');

// ---------- Firebase Admin ----------
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
  console.log('✅ serviceAccountKey.json loaded');
} catch (err) {
  console.error('❌ serviceAccountKey.json not found!');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
const PORT = process.env.PORT || 3001;

// ==================================================
// ✅ CORS Middleware
// ==================================================
const ALLOWED_ORIGINS = [
  'https://doctors.alafiyahhospital.com',
  'https://alafiyahhospital.com',
  'https://www.alafiyahhospital.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// ---------- কনস্ট্যান্ট ----------
const HOSPITAL_ID = 'alafiyah_main';
const HOSPITAL_WHATSAPP = '8801889885094';

let sock = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ---------- ইমেইল ট্রান্সপোর্টার ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==================================================
// ✅ Helper: Format date as DD-MM-YYYY
// ==================================================
function formatDateDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

// ==================================================
// ✅ In-App Notification Save to Firestore
// ==================================================
async function saveInAppNotification(userId, notification, data = {}) {
  if (!userId) {
    console.warn('⚠️ saveInAppNotification: No userId');
    return null;
  }

  try {
    const notificationsRef = db
      .collection('hospitals')
      .doc(HOSPITAL_ID)
      .collection('users')
      .doc(userId)
      .collection('notifications');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const docRef = await notificationsRef.add({
      title: notification.title || 'Notification',
      body: notification.body || '',
      type: notification.type || 'general',
      data: data || {},
      isRead: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    console.log(`✅ In-app notification saved: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('❌ saveInAppNotification error:', error.message);
    return null;
  }
}

// ==================================================
// ✅ FCM Push Notification
// ==================================================
async function sendToDevice(fcmToken, notification, data = {}) {
  if (!fcmToken) {
    console.warn('⚠️ No FCM token provided');
    return { success: false, error: 'No token' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title || 'Al-Afiyah Hospital',
        body: notification.body || '',
      },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        clickAction: data.clickAction || 'OPEN_APP',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'alafiyah_default',
          sound: 'default',
          priority: 'high',
          color: '#1c5fa8',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await getMessaging().send(message);
    console.log(`✅ FCM sent: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ FCM send error:', error.message);

    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      return { success: false, error: 'INVALID_TOKEN', code: error.code };
    }

    return { success: false, error: error.message };
  }
}

// ==================================================
// 📱 SMS পাঠানোর ফাংশন (sms.net.bd)
// ==================================================
async function sendSMS(phoneNumber, message) {
  try {
    const apiKey = process.env.SMS_API_KEY;
    if (!apiKey) {
      console.error('❌ SMS_API_KEY not set');
      return false;
    }

    let number = phoneNumber.replace(/[^0-9]/g, '');
    if (number.startsWith('0')) {
      number = '88' + number.substring(1);
    } else if (!number.startsWith('88')) {
      number = '88' + number;
    }

    console.log(`📤 Sending SMS to: ${number}`);

    const formData = new URLSearchParams();
    formData.append('api_key', apiKey);
    formData.append('to', number);
    formData.append('msg', message);
    if (process.env.SMS_SENDER_ID) {
      formData.append('senderid', process.env.SMS_SENDER_ID);
    }

    const response = await axios.post(
      'https://api.sms.net.bd/sendsms',
      formData.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      }
    );

    console.log(`📥 sms.net.bd response:`, JSON.stringify(response.data, null, 2));

    if (response.data && response.data.error === 0) {
      console.log(`📱 SMS sent successfully: ${response.data.msg}`);
      return true;
    } else {
      const errorMsg = response.data?.msg || 'Unknown error';
      console.error(`❌ SMS send failed: ${errorMsg}`);
      return false;
    }
  } catch (error) {
    console.error('❌ SMS API error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

// ==================================================
// ✅ WhatsApp কানেকশন
// ==================================================
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n====================');
        console.log('📱 WhatsApp QR Scan করুন:');
        console.log('👉 Settings → Linked Devices → Link a Device');
        console.log('====================\n');
        qrcode.generate(qr, { small: true });
        console.log('\n====================\n');
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`\n🔌 Connection closed | statusCode: ${statusCode} | reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          reconnectAttempts++;
          if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(3000 * reconnectAttempts, 15000);
            console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            setTimeout(() => connectToWhatsApp(), delay);
          } else {
            console.error(`❌ Failed after ${MAX_RECONNECT_ATTEMPTS} attempts!`);
          }
        } else {
          console.log('\n❌ WhatsApp logged out!');
          console.log('👉 Delete auth_info_baileys folder and restart');
        }
      } else if (connection === 'open') {
        isConnected = true;
        reconnectAttempts = 0;
        console.log('\n✅ WhatsApp connected!');
        console.log(`📞 Hospital WhatsApp: ${HOSPITAL_WHATSAPP}\n`);
      }
    });
  } catch (error) {
    console.error('❌ connectToWhatsApp error:', error.message);
    console.log('🔄 Retrying in 5s...');
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

// ==================================================
// 🆕 TRIGGER 1: Hospital WhatsApp notification on new booking
// ==================================================
async function sendHospitalNotification(data, appointmentId) {
  if (!isConnected || !sock) {
    console.log(`⚠️ WhatsApp not connected! isConnected=${isConnected}, sock=${!!sock}`);
    return;
  }

  const jid = HOSPITAL_WHATSAPP + '@s.whatsapp.net';
  const formattedDate = formatDateDDMMYYYY(data.bookingDate);

  // ✅ Use English fields directly (no transliteration)
  const englishPatientName = data.nameEn || data.name || '';
  const englishDoctorName = data.doctorNameEn || data.doctorName || '';
  const englishDoctorDept = data.doctorDept || '';
  const englishAddress = data.address || '';

  const msg = `New Booking Alert

Patient: ${englishPatientName || '-'}
Mobile: ${data.mobile || '-'}
Age: ${data.age || '-'}
Gender: ${data.gender || '-'}

Serial: ${data.serialNo || '-'}
Doctor: ${englishDoctorName || '-'}
Department: ${englishDoctorDept || '-'}
Date: ${formattedDate} (${data.bookingDay || '-'})
Time: ${data.doctorTime || 'As scheduled'}

Address: ${englishAddress || '-'}
Referral: ${data.referralSource || '-'}

-------------------
Status: Pending
Booking ID: ${appointmentId}
Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}

Admin confirm korle patient SMS/Email pabe.`;

  try {
    await sock.sendMessage(jid, { text: msg });
    console.log(`📨 Hospital WhatsApp notified.\n`);
  } catch (err) {
    console.error('❌ WhatsApp notification failed:', err.message);
  }
}

// ==================================================
// 🆕 TRIGGER 2: Admin Confirm → Patient SMS + Email + In-App + FCM
// ==================================================
async function sendPatientConfirmation(data, appointmentId) {
  // ✅ Use English fields directly (no transliteration)
  const englishPatientName = data.nameEn || data.name || '';
  const englishDoctorName = data.doctorNameEn || data.doctorName || '';

  const formattedDate = formatDateDDMMYYYY(data.bookingDate);
  const serial = data.serialNo || '';
  const arrivalTime = data.doctorTime || 'As scheduled';

  const smsText = `Al-Afiyah Hospital
Dear ${englishPatientName},
Serial: ${serial}
Doctor: ${englishDoctorName}
Date: ${formattedDate}
Time: ${arrivalTime}
Booking Confirmed. Thank you.`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px;">
      <h2 style="color: #1c5fa8; margin-top: 0;">Al-Afiyah Hospital</h2>
      <p><strong>Dear ${englishPatientName},</strong></p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 6px 0; color: #475569;">Serial:</td>
          <td style="padding: 6px 0; font-weight: 700;">${serial}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #475569;">Doctor:</td>
          <td style="padding: 6px 0; font-weight: 700;">${englishDoctorName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #475569;">Date:</td>
          <td style="padding: 6px 0; font-weight: 700;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #475569;">Time:</td>
          <td style="padding: 6px 0; font-weight: 700;">${arrivalTime}</td>
        </tr>
      </table>
      <p style="color: #16a34a; font-weight: 700;">Booking Confirmed. Thank you.</p>
    </div>
  `;

  // ---------- ১. এসএমএস ----------
  let mobile = data.mobile;
  if (mobile) {
    mobile = mobile.replace(/[^0-9]/g, '');
    if (mobile.startsWith('0')) mobile = '88' + mobile.substring(1);
    else if (!mobile.startsWith('88')) mobile = '88' + mobile;

    const smsSent = await sendSMS(mobile, smsText);
    if (smsSent) {
      console.log(`📱 SMS sent to ${mobile}`);
    } else {
      console.log(`⚠️ SMS failed for ${mobile}`);
    }
  }

  // ---------- ২. ইমেইল ----------
  if (data.email) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: data.email,
        subject: `Booking Confirmed - Serial ${serial}`,
        html: emailHtml,
      });
      console.log(`📧 Email sent to ${data.email}`);
    } catch (err) {
      console.error('❌ Email error:', err.message);
    }
  }

  // ---------- ৩. In-App Notification ----------
  if (data.userId) {
    await saveInAppNotification(
      data.userId,
      {
        title: 'Booking Confirmed',
        body: `Serial #${serial} · ${englishDoctorName} · ${formattedDate}`,
        type: 'booking_confirmed',
      },
      {
        appointmentId: appointmentId,
        doctorName: englishDoctorName,
        serialNo: String(serial),
        bookingDate: data.bookingDate || '',
      }
    );

    // ---------- ৪. FCM Push Notification ----------
    try {
      const userDoc = await db
        .collection('hospitals')
        .doc(HOSPITAL_ID)
        .collection('users')
        .doc(data.userId)
        .get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        let fcmTokens = [];

        if (Array.isArray(userData.fcmTokens)) {
          fcmTokens = userData.fcmTokens.map((t) =>
            typeof t === 'string' ? t : t.token
          );
        } else if (userData.fcmToken) {
          fcmTokens = [userData.fcmToken];
        }

        if (fcmTokens.length > 0) {
          await sendToDevice(
            fcmTokens[0],
            {
              title: 'Booking Confirmed',
              body: `Serial #${serial} · ${englishDoctorName}`,
            },
            {
              type: 'BOOKING_CONFIRMED',
              appointmentId: appointmentId,
              serialNo: String(serial),
              clickAction: 'OPEN_APPOINTMENT',
            }
          );
        }
      }
    } catch (fcmErr) {
      console.warn('⚠️ FCM push failed:', fcmErr.message);
    }
  }
}

// ==================================================
// 📢 Queue Next API (FCM)
// ==================================================
app.post('/api/queue/next', async (req, res) => {
  try {
    const { hospitalId, doctorId, date, nextSerial } = req.body;

    if (!hospitalId || !doctorId || !date) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    console.log(`📢 Queue Next API: Serial #${nextSerial} for doctor ${doctorId}`);

    const appointmentsRef = db
      .collection('hospitals')
      .doc(hospitalId)
      .collection('appointments');

    const snapshot = await appointmentsRef
      .where('doctorId', '==', doctorId)
      .where('bookingDate', '==', date)
      .where('serialNo', '==', nextSerial)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ success: false, error: 'No appointment found' });
    }

    const appointment = snapshot.docs[0].data();
    const userId = appointment.userId;

    if (!userId) {
      return res.json({ success: false, error: 'Patient has no user account' });
    }

    const userDoc = await db
      .collection('hospitals')
      .doc(hospitalId)
      .collection('users')
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return res.json({ success: false, error: 'User not found' });
    }

    const userData = userDoc.data();
    let fcmTokens = [];

    if (Array.isArray(userData.fcmTokens)) {
      fcmTokens = userData.fcmTokens.map((t) =>
        typeof t === 'string' ? t : t.token
      );
    } else if (userData.fcmToken) {
      fcmTokens = [userData.fcmToken];
    }

    // ✅ Use English doctor name
    const englishDoctorName = appointment.doctorNameEn || appointment.doctorName || '';

    let fcmResult = { success: false, error: 'No FCM token' };
    if (fcmTokens.length > 0) {
      fcmResult = await sendToDevice(
        fcmTokens[0],
        {
          title: 'Your serial is next!',
          body: `Please be ready at ${englishDoctorName}'s chamber. Serial #${nextSerial}`,
        },
        {
          type: 'QUEUE_UPDATE',
          appointmentId: snapshot.docs[0].id,
          mySerial: String(nextSerial),
        }
      );
    }

    await saveInAppNotification(
      userId,
      {
        title: 'Your serial is next!',
        body: `Please be ready at ${englishDoctorName}'s chamber. Serial #${nextSerial}`,
        type: 'queue_update',
      },
      {
        appointmentId: snapshot.docs[0].id,
        doctorName: englishDoctorName,
        serialNo: String(nextSerial),
      }
    );

    console.log(`✅ FCM: ${fcmResult.success} | In-App: saved`);
    res.json({ success: true, result: fcmResult });
  } catch (error) {
    console.error('❌ Queue API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================================================
// ✅ Confirm Appointment with Custom Message
// ==================================================
app.post('/api/appointment/confirm-with-message', async (req, res) => {
  try {
    const {
      hospitalId,
      appointmentId,
      customSerial,
      customDoctorTime,
      customNote,
    } = req.body;

    if (!hospitalId || !appointmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing hospitalId or appointmentId',
      });
    }

    console.log(
      `📢 Confirm API: ${appointmentId} | Serial: ${customSerial} | Time: ${customDoctorTime}`
    );

    const apptRef = db
      .collection('hospitals')
      .doc(hospitalId)
      .collection('appointments')
      .doc(appointmentId);

    const apptDoc = await apptRef.get();

    if (!apptDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
    }

    const data = apptDoc.data();

    const updates = {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      confirmedBy: 'admin',
    };

    if (customSerial) updates.serialNo = customSerial;
    if (customDoctorTime) updates.doctorTime = customDoctorTime;
    if (customNote) updates.confirmNote = customNote;

    await apptRef.update(updates);
    console.log(`✅ Appointment updated: ${appointmentId}`);

    const editedData = {
      ...data,
      serialNo: customSerial || data.serialNo,
      doctorTime: customDoctorTime || data.doctorTime,
      confirmNote: customNote || '',
    };

    try {
      await sendPatientConfirmation(editedData, appointmentId);
      console.log(`✅ Patient notification sent for ${appointmentId}`);
    } catch (notifErr) {
      console.error('⚠️ Notification send failed:', notifErr.message);
      return res.json({
        success: true,
        message: 'Appointment confirmed but notification may have failed',
        warning: notifErr.message,
      });
    }

    res.json({
      success: true,
      message: 'Appointment confirmed and notification sent',
    });
  } catch (error) {
    console.error('❌ Confirm API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================================================
// 📢 Promotional Notification API
// ==================================================
app.post('/api/notification/send-promo', async (req, res) => {
  try {
    const { title, body, targetUserIds } = req.body;

    if (!title || !body) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing title or body' });
    }

    let userIds = targetUserIds;

    if (!userIds || userIds.length === 0) {
      const usersSnap = await db
        .collection('hospitals')
        .doc(HOSPITAL_ID)
        .collection('users')
        .where('approved', '==', true)
        .get();

      userIds = usersSnap.docs.map((d) => d.id);
    }

    console.log(`📢 Sending promo to ${userIds.length} users`);

    const results = [];

    for (const userId of userIds) {
      const notifId = await saveInAppNotification(
        userId,
        { title, body, type: 'promo' },
        { isPromo: true }
      );

      try {
        const userDoc = await db
          .collection('hospitals')
          .doc(HOSPITAL_ID)
          .collection('users')
          .doc(userId)
          .get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          let fcmTokens = [];
          if (Array.isArray(userData.fcmTokens)) {
            fcmTokens = userData.fcmTokens.map((t) =>
              typeof t === 'string' ? t : t.token
            );
          } else if (userData.fcmToken) {
            fcmTokens = [userData.fcmToken];
          }

          if (fcmTokens.length > 0) {
            await sendToDevice(
              fcmTokens[0],
              { title, body },
              { type: 'PROMO', clickAction: 'OPEN_APP' }
            );
          }
        }
      } catch (err) {
        console.warn(`⚠️ FCM failed for user ${userId}:`, err.message);
      }

      results.push({ userId, notifId });
    }

    res.json({
      success: true,
      sent: results.length,
      results,
    });
  } catch (error) {
    console.error('❌ Promo API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================================================
// 🏠 Root endpoint
// ==================================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    hospital: HOSPITAL_ID,
    whatsapp: isConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ==================================================
// 🔥 FIREBASE লিসেনার — Auto-trigger on pending → confirmed
// ==================================================
const previousStatuses = new Map();
const appointmentsPath = `hospitals/${HOSPITAL_ID}/appointments`;

console.log(`\n🔍 Firestore listener starting: ${appointmentsPath}`);
console.log(`📢 Trigger 1: New booking → Hospital WhatsApp`);
console.log(`📢 Trigger 2: Direct Firestore confirm → SMS + Email + In-App\n`);

db.collection(appointmentsPath).onSnapshot(
  (snapshot) => {
    console.log(`📊 Snapshot: ${snapshot.docChanges().length} changes`);

    snapshot.docChanges().forEach(async (change) => {
      const docId = change.doc.id;
      const data = change.doc.data();
      const currentStatus = data.status;

      // ---------- Added ----------
      if (change.type === 'added') {
        previousStatuses.set(docId, currentStatus);

        const rawDate = data.createdAt || data.timestamp;
        const createdAt = rawDate?.toDate
          ? rawDate.toDate()
          : rawDate?.seconds
          ? new Date(rawDate.seconds * 1000)
          : rawDate
          ? new Date(rawDate)
          : null;

        const now = new Date();
        const secondsSinceCreation = createdAt
          ? (now.getTime() - createdAt.getTime()) / 1000
          : 999;

        const isFreshBooking = secondsSinceCreation < 300;

        console.log(
          `➕ New appointment: ${docId} | status: ${currentStatus} | age: ${Math.round(secondsSinceCreation)}s | fresh: ${isFreshBooking}`
        );

        if (isFreshBooking) {
          console.log(`\n✅ New booking → Sending to Hospital WhatsApp...`);
          try {
            await sendHospitalNotification(data, docId);
          } catch (err) {
            console.error('❌ sendHospitalNotification error:', err.message);
          }
        }
      }

      // ---------- Modified ----------
      if (change.type === 'modified') {
        const previousStatus = previousStatuses.get(docId);
        console.log(
          `🔄 Modified: ${docId} | prev: ${previousStatus} → curr: ${currentStatus}`
        );

        if (previousStatus === 'pending' && currentStatus === 'confirmed') {
          if (data.confirmedBy === 'admin') {
            console.log(
              `⏭️ API confirmed — listener skipping (already sent)`
            );
          } else {
            console.log(
              `\n✅ Direct Firestore confirm detected! Sending notification...`
            );
            try {
              await sendPatientConfirmation(data, docId);
              console.log(`✅ Patient notification sent\n`);
            } catch (err) {
              console.error('❌ sendPatientConfirmation error:', err.message);
            }
          }
        }

        previousStatuses.set(docId, currentStatus);
      }

      // ---------- Removed ----------
      if (change.type === 'removed') {
        previousStatuses.delete(docId);
        console.log(`➖ Appointment removed: ${docId}`);
      }
    });
  },
  (error) => {
    console.error('❌ Firestore listener error:', error.message);
  }
);

// ==================================================
// 🚀 সার্ভার চালু
// ==================================================
app.listen(PORT, () => {
  console.log(`🚀 Backend Server running on port: ${PORT}`);
  console.log(`📁 Hospital ID: ${HOSPITAL_ID}`);
  console.log(`📁 Appointments path: ${appointmentsPath}`);
  console.log(`📞 Hospital WhatsApp: ${HOSPITAL_WHATSAPP}`);
  console.log(`🌐 CORS allowed origins: ${ALLOWED_ORIGINS.join(', ')}\n`);
});

// ---------- WhatsApp কানেকশন শুরু ----------
connectToWhatsApp();

// ---------- Graceful Shutdown ----------
process.on('SIGINT', () => {
  console.log('\n\n🛑 Server shutting down...');
  if (sock) {
    try {
      sock.end(undefined);
    } catch (e) {}
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});