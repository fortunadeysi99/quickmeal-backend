const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const User = require("../models/User");

let initialized = false;
let enabled = false;

function loadServiceAccount() {
  const defaultPath = path.resolve(
    __dirname,
    "../.credentials/quickmeal-eb890-firebase-adminsdk-fbsvc-e62d34fc3b.json"
  );

  if (fs.existsSync(defaultPath)) {
    return JSON.parse(fs.readFileSync(defaultPath, "utf8"));
  }

  return null;
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
