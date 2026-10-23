import * as SecureStore from "expo-secure-store";

function notificationKey(reportId) {
  return `prevention-notification.${encodeURIComponent(reportId)}`;
}

export function hasNotifiedPreventionTeam(reportId) {
  return SecureStore.getItemAsync(notificationKey(reportId)).then(Boolean);
}

export function markPreventionNotificationSent(reportId, notifiedAt) {
  return SecureStore.setItemAsync(notificationKey(reportId), notifiedAt);
}
