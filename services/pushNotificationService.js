const admin = require("firebase-admin");
const User = require("../models/User");

let initialized = false;
let enabled = false;
let lastInitError = null;

function readServiceAccountInputs() {
  const projectId = process.env.project_id || process.env.FIREBASE_PROJECT_ID;
  const privateKeyId = process.env.private_key_id || process.env.FIREBASE_PRIVATE_KEY_ID;
  const privateKeyRaw = process.env.private_key || process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.client_email || process.env.FIREBASE_CLIENT_EMAIL;
  const clientId = process.env.client_id || process.env.FIREBASE_CLIENT_ID;
  const clientX509CertUrl =
    process.env.client_x509_cert_url || process.env.FIREBASE_CLIENT_X509_CERT_URL;

  const missingFields = [];

  if (!projectId) missingFields.push("project_id");
  if (!privateKeyId) missingFields.push("private_key_id");
  if (!privateKeyRaw) missingFields.push("private_key");
  if (!clientEmail) missingFields.push("client_email");
  if (!clientId) missingFields.push("client_id");
  if (!clientX509CertUrl) missingFields.push("client_x509_cert_url");

  return {
    projectId,
    privateKeyId,
    privateKeyRaw,
    clientEmail,
    clientId,
    clientX509CertUrl,
    missingFields,
  };
}

function normalizePrivateKey(rawValue) {
  if (!rawValue) {
    return rawValue;
  }

  let value = String(rawValue).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  value = value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return value;
}

function buildServiceAccount() {
  const inputs = readServiceAccountInputs();

  if (inputs.missingFields.length > 0) {
    return null;
  }

  const privateKey = normalizePrivateKey(inputs.privateKeyRaw);

  return {
    type: "service_account",
    project_id: inputs.projectId,
    private_key_id: inputs.privateKeyId,
    private_key: privateKey,
    client_email: inputs.clientEmail,
    client_id: inputs.clientId,
    client_x509_cert_url: inputs.clientX509CertUrl,
  };
}

function initFirebaseAdmin() {
  if (initialized) return enabled;
  initialized = true;
  lastInitError = null;

  try {
    const serviceAccount = buildServiceAccount();
    if (!serviceAccount) {
      const inputs = readServiceAccountInputs();
      lastInitError = {
        reason: "missing-service-account-env",
        message: "Firebase service account env values are missing",
        missingFields: inputs.missingFields,
      };
      console.warn("FCM init failed: missing Firebase service account env values", inputs.missingFields);
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
    lastInitError = {
      reason: "firebase-admin-init-error",
      message: err.message,
      stack: err.stack,
    };
    console.error("FCM init error:", err.message);
    console.error("FCM init error stack:", err.stack);
    enabled = false;
    return false;
  }
}

function getFirebaseDiagnostics() {
  const inputs = readServiceAccountInputs();

  return {
    initialized,
    enabled,
    configured: inputs.missingFields.length === 0,
    missingFields: inputs.missingFields,
    serviceAccount: {
      projectId: inputs.projectId || null,
      clientEmail: inputs.clientEmail || null,
      clientId: inputs.clientId || null,
      clientX509CertUrl: inputs.clientX509CertUrl || null,
      privateKeyLoaded: Boolean(inputs.privateKeyRaw),
    },
    lastInitError,
  };
}

async function sendPushToUser({ userId, title, body, data = {} }) {
  if (!initFirebaseAdmin()) {
    return {
      success: false,
      reason: "fcm-not-configured",
      error: lastInitError,
    };
  }

  const user = await User.findById(userId).select("mobileDevices");
  if (!user || !Array.isArray(user.mobileDevices) || user.mobileDevices.length === 0) {
    return {
      success: false,
      reason: "no-device",
      error: {
        reason: "no-device",
        message: "Tidak ada perangkat terdaftar",
      },
    };
  }

  const tokens = [...new Set(user.mobileDevices.map((d) => d.deviceToken).filter(Boolean))];
  if (tokens.length === 0) {
    return {
      success: false,
      reason: "no-token",
      error: {
        reason: "no-token",
        message: "Tidak ada token FCM yang valid",
      },
    };
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
    error: response.failureCount > 0
      ? {
          reason: "partial-failure",
          message: "Sebagian token gagal menerima notifikasi",
        }
      : null,
  };
}

module.exports = {
  sendPushToUser,
  getFirebaseDiagnostics,
};
