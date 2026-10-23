import * as SecureStore from "expo-secure-store";

const CHUNK_LENGTH = 350;

function storageKey(phiId, taskId, index = "manifest") {
  return `inspection-draft.${encodeURIComponent(phiId)}.${encodeURIComponent(taskId)}.${index}`;
}

function splitForSecureStore(value) {
  const characters = Array.from(value);
  const chunks = [];
  for (let offset = 0; offset < characters.length; offset += CHUNK_LENGTH) {
    chunks.push(characters.slice(offset, offset + CHUNK_LENGTH).join(""));
  }
  return chunks;
}

export async function readLocalInspectionDraft(phiId, taskId) {
  const manifest = await SecureStore.getItemAsync(storageKey(phiId, taskId));
  if (!manifest) return null;
  const { chunkCount } = JSON.parse(manifest);
  const chunks = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.getItemAsync(storageKey(phiId, taskId, index))
    )
  );
  if (chunks.some((chunk) => chunk === null)) return null;
  return JSON.parse(chunks.join(""));
}

export async function writeLocalInspectionDraft(phiId, taskId, value) {
  const key = storageKey(phiId, taskId);
  const previous = await SecureStore.getItemAsync(key);
  const previousCount = previous ? JSON.parse(previous).chunkCount : 0;
  const chunks = splitForSecureStore(JSON.stringify(value));
  await Promise.all(chunks.map((chunk, index) =>
    SecureStore.setItemAsync(storageKey(phiId, taskId, index), chunk)
  ));
  await SecureStore.setItemAsync(key, JSON.stringify({ chunkCount: chunks.length }));
  await Promise.all(Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, index) =>
    SecureStore.deleteItemAsync(storageKey(phiId, taskId, chunks.length + index))
  ));
}

export async function removeLocalInspectionDraft(phiId, taskId) {
  const key = storageKey(phiId, taskId);
  const manifest = await SecureStore.getItemAsync(key);
  if (manifest) {
    const { chunkCount } = JSON.parse(manifest);
    await Promise.all(Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(storageKey(phiId, taskId, index))
    ));
  }
  await SecureStore.deleteItemAsync(key);
}