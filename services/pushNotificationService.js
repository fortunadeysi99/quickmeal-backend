const admin = require("firebase-admin");
const User = require("../models/User");

let initialized = false;
let enabled = false;

function loadServiceAccount() {
  const projectId = process.env.project_id || process.env.FIREBASE_PROJECT_ID;
  const privateKeyId = process.env.private_key_id || process.env.FIREBASE_PRIVATE_KEY_ID;
  const privateKeyRaw = process.env.private_key || process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.client_email || process.env.FIREBASE_CLIENT_EMAIL;
  const clientId = process.env.client_id || process.env.FIREBASE_CLIENT_ID;
  const clientX509CertUrl =
    process.env.client_x509_cert_url || process.env.FIREBASE_CLIENT_X509_CERT_URL;

  if (!projectId || !privateKeyId || !privateKeyRaw || !clientEmail || !clientId || !clientX509CertUrl) {
    return null;
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  return {
    type: "service_account",
    project_id: projectId,
    private_key_id: privateKeyId,
    private_key: privateKey,
    client_email: clientEmail,
    client_id: clientId,
    client_x509_cert_url: clientX509CertUrl,
  };
}

function initFirebaseAdmin() {
  if (initialized) return enabled;
  initialized = true;

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      return false;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    enabled = true;
    return true;
  } catch (err) {
    console.error("FCM init error:", err.message);
    enabled = false;
    return false;
  }
}

async function sendPushToUser({ userId, title, body, data = {} }) {
  if (!initFirebaseAdmin()) {
    return { success: false, reason: "fcm-not-configured" };
  }

  const user = await User.findById(userId).select("mobileDevices");
  if (!user || !Array.isArray(user.mobileDevices) || user.mobileDevices.length === 0) {
    return { success: false, reason: "no-device" };
  }

  const tokens = [...new Set(user.mobileDevices.map((d) => d.deviceToken).filter(Boolean))];
  if (tokens.length === 0) {
    return { success: false, reason: "no-token" };
  }

  const message = {
    tokens,
    notification: {
      title,
      body,
    },
    data: Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    }, {}),
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  const invalidTokens = [];
  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await User.updateOne(
      { _id: userId },
      { $pull: { mobileDevices: { deviceToken: { $in: invalidTokens } } } }
    );
  }

  return {
    success: response.successCount > 0,
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}

module.exports = {
  sendPushToUser,
};
