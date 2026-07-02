function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function upsertUserDevice(user, payload = {}) {
  const deviceId = normalizeString(payload.deviceId);
  const deviceToken = normalizeString(payload.deviceToken);
  const platform = normalizeString(payload.platform) || "android";

  if (!deviceId && !deviceToken) {
    return false;
  }

  const existingDevices = Array.isArray(user.mobileDevices)
    ? user.mobileDevices.map((item) => ({
        deviceId: normalizeString(item.deviceId),
        deviceToken: normalizeString(item.deviceToken),
        platform: normalizeString(item.platform) || "android",
        lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt) : new Date(0),
      }))
    : [];

  const now = new Date();
  const matchIndex = existingDevices.findIndex(
    (item) =>
      (deviceId && item.deviceId === deviceId) ||
      (deviceToken && item.deviceToken === deviceToken)
  );

  if (matchIndex >= 0) {
    existingDevices[matchIndex] = {
      ...existingDevices[matchIndex],
      deviceId: deviceId || existingDevices[matchIndex].deviceId,
      deviceToken: deviceToken || existingDevices[matchIndex].deviceToken,
      platform,
      lastSeenAt: now,
    };
  } else {
    existingDevices.push({
      deviceId,
      deviceToken,
      platform,
      lastSeenAt: now,
    });
  }

  const deduped = [];
  for (const item of existingDevices.sort((a, b) => b.lastSeenAt - a.lastSeenAt)) {
    if (!item.deviceId && !item.deviceToken) continue;

    const duplicateByDeviceId = item.deviceId && deduped.some((d) => d.deviceId === item.deviceId);
    const duplicateByToken = item.deviceToken && deduped.some((d) => d.deviceToken === item.deviceToken);

    if (duplicateByDeviceId || duplicateByToken) {
      continue;
    }

    deduped.push(item);

    if (deduped.length >= 10) {
      break;
    }
  }

  user.mobileDevices = deduped;
  await user.save();
  return true;
}

async function unregisterUserDevice(user, payload = {}) {
  const deviceId = normalizeString(payload.deviceId);
  const deviceToken = normalizeString(payload.deviceToken);

  if (!deviceId && !deviceToken) {
    return false;
  }

  const existingDevices = Array.isArray(user.mobileDevices) ? user.mobileDevices : [];
  user.mobileDevices = existingDevices.filter((item) => {
    const currentDeviceId = normalizeString(item.deviceId);
    const currentToken = normalizeString(item.deviceToken);

    if (deviceId && currentDeviceId === deviceId) return false;
    if (deviceToken && currentToken === deviceToken) return false;
    return true;
  });

  await user.save();
  return true;
}

module.exports = {
  upsertUserDevice,
  unregisterUserDevice,
};
