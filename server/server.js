// server.js
// ==================================================
// 🏥 আল-আফিয়া হাসপাতাল — Backend Server
// ==================================================
// ✅ WhatsApp via Baileys (Railway Volume persistent session)
// ✅ SMS via sms.net.bd (English only)
// ✅ Email via Gmail
// ✅ FCM Push Notifications
// ✅ Uses nameEn / doctorNameEn (no transliteration)
// ✅ Service account from env variable OR file
// ✅ Invalid FCM token auto-cleanup
// ✅ QR code HTTP endpoint for easy WhatsApp linking
// ✅ Reduced logging to stay under Railway rate limit
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
const nodemailer = require('nodemailer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// ---------- Firebase Admin ----------
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// ==================================================
// ✅ Load service account (env variable OR file)
// ==================================================
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const decoded = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT,
      'base64'
    ).toString('utf-8');
    serviceAccount = JSON.parse(decoded);
    console.log('✅ serviceAccount loaded from env variable');
  } else {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('✅ serviceAccountKey.json loaded');
  }
} catch (err) {
  console.error('❌ serviceAccount not found!');
  console.error('   → Set FIREBASE_SERVICE_ACCOUNT env variable (base64), OR');
  console.error('   → Add serviceAccountKey.json file in server folder');
  console.error('   Error:', err.message);
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

app.use(express.json({ limit: '5mb' }));

// ---------- কনস্ট্যান্ট ----------
const HOSPITAL_ID = 'alafiyah_main';
const HOSPITAL_WHATSAPP = '8801889885094';

let sock = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ✅ Store latest QR code for HTTP endpoint
let latestQR = null;
let qrGeneratedAt = null;

// ==================================================
// ✅ WhatsApp auth directory — Railway volume aware
// ==================================================
const getAuthDir = () => {
  const volumeMountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH;

  if (volumeMountPath) {
    const dir = path.join(volumeMountPath, 'auth_info_baileys');
    console.log(`📁 Using Railway volume path: ${dir}`);
    return dir;
  }

  const localDir = path.join(__dirname, 'auth_info_baileys');
  console.log(`📁 Using local path: ${localDir}`);
  return localDir;
};

const AUTH_DIR = getAuthDir();

// Ensure directory exists
try {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    console.log(`✅ Created auth directory: ${AUTH_DIR}`);
  }
} catch (err) {
  console.error(`❌ Failed to create auth directory: ${err.message}`);
}

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

    return docRef.id;
  } catch (error) {
    console.error('❌ saveInAppNotification error:', error.message);
    return null;
  }
}

// ==================================================
// ✅ Get FCM tokens from user doc (normalized)
// ==================================================
function extractFcmTokens(userData) {
  let tokens = [];

  if (Array.isArray(userData.fcmTokens)) {
    tokens = userData.fcmTokens.map((t) =>
      typeof t === 'string' ? t : t.token
    );
  } else if (userData.fcmToken) {
    tokens = [userData.fcmToken];
  }

  // Dedupe + filter falsy
  return [...new Set(tokens.filter(Boolean))];
}

// ==================================================
// ✅ FCM Push Notification
// ==================================================
async function sendToDevice(fcmToken, notification, data = {}) {
  if (!fcmToken) {
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
    // Only log actual errors (not token issues)
    if (
      error.code !== 'messaging/invalid-registration-token' &&
      error.code !== 'messaging/registration-token-not-registered'
    ) {
      console.error('❌ FCM send error:', error.message);
    }

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
// ✅ FCM Token Cleanup
// ==================================================
async function cleanupInvalidToken(hospitalId, userId, invalidToken) {
  try {
    const userRef = db
      .collection('hospitals')
      .doc(hospitalId)
      .collection('users')
      .doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) return;

    const userData = userDoc.data();
    let tokens = [];

    if (Array.isArray(userData.fcmTokens)) {
      tokens = userData.fcmTokens;
    } else if (userData.fcmToken) {
      tokens = [userData.fcmToken];
    }

    const cleanedTokens = tokens.filter((t) => {
      const tokenStr = typeof t === 'string' ? t : t?.token;
      return tokenStr !== invalidToken;
    });

    if (cleanedTokens.length === tokens.length) return;

    await userRef.update({
      fcmTokens: cleanedTokens,
      lastTokenCleanup: new Date().toISOString(),
    });

    console.log(`🧹 Cleaned invalid token for user ${userId}`);
  } catch (err) {
    // silent
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

    if (response.data && response.data.error === 0) {
      console.log(`📱 SMS sent to ${number}`);
      return true;
    } else {
      console.error(`❌ SMS failed: ${response.data?.msg || 'Unknown'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ SMS API error:', error.message);
    return false;
  }
}

// ==================================================
// ✅ WhatsApp কানেকশন (Railway volume persistent)
// ==================================================
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      // ✅ Reduce network traffic and logging
      syncFullHistory: false,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // ✅ Store QR for HTTP endpoint
        latestQR = qr;
        qrGeneratedAt = new Date().toISOString();

        const publicUrl =
          process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/qr`
            : `http://localhost:${PORT}/qr`;

        console.log('\n====================');
        console.log('📱 WhatsApp QR Code ready!');
        console.log(`🌐 Open in browser: ${publicUrl}`);
        console.log('👉 Scan with: Settings → Linked Devices → Link a Device');
        console.log('====================\n');
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`🔌 Closed | statusCode: ${statusCode} | reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          reconnectAttempts++;
          if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(3000 * reconnectAttempts, 15000);
            setTimeout(() => connectToWhatsApp(), delay);
          } else {
            console.error(`❌ Failed after ${MAX_RECONNECT_ATTEMPTS} attempts!`);
          }
        } else {
          console.log('\n❌ WhatsApp logged out!');
          console.log('👉 Delete auth folder and restart to scan new QR');
          console.log('👉 Or visit /qr endpoint after restart');
        }
      } else if (connection === 'open') {
        isConnected = true;
        reconnectAttempts = 0;
        latestQR = null; // Clear QR once connected
        qrGeneratedAt = null;
        console.log('✅ WhatsApp connected!');
      }
    });
  } catch (error) {
    console.error('❌ connectToWhatsApp error:', error.message);
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

// ==================================================
// 🌐 QR Code HTTP Endpoint — for easy WhatsApp linking
// ==================================================
app.get('/qr', (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>WhatsApp Status</title>
          <meta charset="UTF-8">
        </head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f4f8;font-family:sans-serif;">
          <div style="text-align:center;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            <div style="font-size:64px;margin-bottom:20px;">✅</div>
            <h1 style="color:#16a34a;margin:0 0 10px 0;">WhatsApp Connected</h1>
            <p style="color:#64748b;margin:0;">No QR code needed.</p>
          </div>
        </body>
      </html>
    `);
  }

  if (!latestQR) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>WhatsApp Status</title>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f4f8;font-family:sans-serif;">
          <div style="text-align:center;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            <div style="font-size:64px;margin-bottom:20px;">⏳</div>
            <h1 style="color:#d97706;margin:0 0 10px 0;">Waiting for QR...</h1>
            <p style="color:#64748b;margin:0;">Page auto-refreshes every 5 seconds.</p>
          </div>
        </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>WhatsApp QR Code</title>
        <meta charset="UTF-8">
      </head>
      <body style="display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f4f8;font-family:sans-serif;padding:20px;">
        <div style="text-align:center;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:500px;">
          <h1 style="color:#1c5fa8;margin:0 0 10px 0;font-size:24px;">📱 WhatsApp QR Code</h1>
          <p style="color:#64748b;margin:0 0 24px 0;font-size:14px;">Scan this QR code with the Hospital WhatsApp</p>
          <div id="qrcode" style="display:flex;justify-content:center;margin:20px 0;"></div>
          <p style="color:#64748b;margin:20px 0 0 0;font-size:13px;">
            <strong>Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong>
          </p>
          <p style="color:#94a3b8;margin:10px 0 0 0;font-size:11px;">
            Generated: ${qrGeneratedAt || 'just now'}
          </p>
          <p style="margin:20px 0 0 0;">
            <button onclick="location.reload()" style="background:#1c5fa8;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;">
              🔄 Refresh
            </button>
          </p>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <script>
          try {
            QRCode.toCanvas(
              document.getElementById('qrcode'),
              '${latestQR}',
              { width: 300, margin: 2, color: { dark: '#1c5fa8', light: '#ffffff' } },
              function (error) {
                if (error) {
                  document.getElementById('qrcode').innerHTML = 
                    '<p style="color:red;">Error rendering QR. <br>Try refreshing or use terminal QR.</p>';
                  console.error(error);
                }
              }
            );
          } catch (e) {
            console.error(e);
          }
          // Auto-refresh every 20 seconds (QR expires)
          setTimeout(function() { location.reload(); }, 20000);
        </script>
      </body>
    </html>
  `);
});

// ==================================================
// 🆕 TRIGGER 1: Hospital WhatsApp notification on new booking
// ==================================================
async function sendHospitalNotification(data, appointmentId) {
  if (!isConnected || !sock) {
    return;
  }

  const jid = HOSPITAL_WHATSAPP + '@s.whatsapp.net';
  const formattedDate = formatDateDDMMYYYY(data.bookingDate);

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
Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}`;

  try {
    await sock.sendMessage(jid, { text: msg });
    console.log(`📨 Hospital WhatsApp notified: ${appointmentId}`);
  } catch (err) {
    console.error('❌ WhatsApp notification failed:', err.message);
  }
}

// ==================================================
// 🆕 TRIGGER 2: Admin Confirm → Patient SMS + Email + In-App + FCM
// ==================================================
async function sendPatientConfirmation(data, appointmentId) {
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

    await sendSMS(mobile, smsText);
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
      console.log(`📧 Email sent: ${appointmentId}`);
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
        const fcmTokens = extractFcmTokens(userData);

        for (const token of fcmTokens) {
          const result = await sendToDevice(
            token,
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

          if (!result.success && result.error === 'INVALID_TOKEN') {
            await cleanupInvalidToken(HOSPITAL_ID, data.userId, token);
          }
        }
      }
    } catch (fcmErr) {
      // silent
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
    const fcmTokens = extractFcmTokens(userData);

    const englishDoctorName = appointment.doctorNameEn || appointment.doctorName || '';

    let fcmResult = { success: false, error: 'No FCM token' };

    for (const token of fcmTokens) {
      fcmResult = await sendToDevice(
        token,
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

      if (!fcmResult.success && fcmResult.error === 'INVALID_TOKEN') {
        await cleanupInvalidToken(hospitalId, userId, token);
      }

      if (fcmResult.success) break;
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

    res.json({ success: true, result: fcmResult });
  } catch (error) {
    console.error('❌ Queue API error:', error.message);
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
    console.log(`✅ Confirmed: ${appointmentId}`);

    const editedData = {
      ...data,
      serialNo: customSerial || data.serialNo,
      doctorTime: customDoctorTime || data.doctorTime,
      confirmNote: customNote || '',
    };

    try {
      await sendPatientConfirmation(editedData, appointmentId);
    } catch (notifErr) {
      return res.json({
        success: true,
        message: 'Confirmed but notification may have failed',
        warning: notifErr.message,
      });
    }

    res.json({
      success: true,
      message: 'Appointment confirmed and notification sent',
    });
  } catch (error) {
    console.error('❌ Confirm API error:', error.message);
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

    console.log(`📢 Promo to ${userIds.length} users`);

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
          const fcmTokens = extractFcmTokens(userData);

          for (const token of fcmTokens) {
            const fcmResult = await sendToDevice(
              token,
              { title, body },
              { type: 'PROMO', clickAction: 'OPEN_APP' }
            );

            if (!fcmResult.success && fcmResult.error === 'INVALID_TOKEN') {
              await cleanupInvalidToken(HOSPITAL_ID, userId, token);
            }
          }
        }
      } catch (err) {
        // silent
      }

      results.push({ userId, notifId });
    }

    console.log(`✅ Promo sent to ${results.length} users`);

    res.json({
      success: true,
      sent: results.length,
      results,
    });
  } catch (error) {
    console.error('❌ Promo API error:', error.message);
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
    authDir: AUTH_DIR,
    volumeAttached: !!process.env.RAILWAY_VOLUME_MOUNT_PATH,
    timestamp: new Date().toISOString(),
  });
});

// ==================================================
// 🔥 FIREBASE লিসেনার — Auto-trigger on pending → confirmed
// ==================================================
const previousStatuses = new Map();
const appointmentsPath = `hospitals/${HOSPITAL_ID}/appointments`;

console.log(`🔍 Firestore listener: ${appointmentsPath}`);

db.collection(appointmentsPath).onSnapshot(
  (snapshot) => {
    // ✅ Removed global snapshot log (was flooding Railway)

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

        // ✅ Only log + notify for fresh bookings
        if (isFreshBooking) {
          console.log(`➕ New booking: ${docId}`);
          try {
            await sendHospitalNotification(data, docId);
          } catch (err) {
            console.error('❌ Hospital notification error:', err.message);
          }
        }
      }

      // ---------- Modified ----------
      if (change.type === 'modified') {
        const previousStatus = previousStatuses.get(docId);

        if (previousStatus === 'pending' && currentStatus === 'confirmed') {
          if (data.confirmedBy === 'admin') {
            // Already sent via API — skip
          } else {
            console.log(`✅ Confirmed (direct): ${docId}`);
            try {
              await sendPatientConfirmation(data, docId);
            } catch (err) {
              console.error('❌ Patient notification error:', err.message);
            }
          }
        }

        previousStatuses.set(docId, currentStatus);
      }

      // ---------- Removed ----------
      if (change.type === 'removed') {
        previousStatuses.delete(docId);
        // ✅ Removed log (was flooding)
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
  console.log(`🚀 Server running on port: ${PORT}`);
  console.log(`📁 Auth dir: ${AUTH_DIR}`);
  console.log(`🔗 Volume: ${process.env.RAILWAY_VOLUME_MOUNT_PATH || 'none'}`);
  console.log(`🌐 Public URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`);
  console.log(`📱 QR endpoint: /qr\n`);
});

// ---------- WhatsApp কানেকশন শুরু ----------
connectToWhatsApp();

// ---------- Graceful Shutdown ----------
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (sock) {
    try {
      sock.end(undefined);
    } catch (e) {}
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled:', reason);
});