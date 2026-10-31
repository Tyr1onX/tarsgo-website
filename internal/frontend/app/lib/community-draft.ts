import type { CommunityCategory } from "~/lib/community-client";

export interface CommunityDraft {
  category: CommunityCategory;
  title: string;
  body: string;
  files: File[];
  updatedAt: number;
}

const DATABASE_NAME = "tarsgo-community-drafts";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;

function openDraftDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve<IDBDatabase | null>(null);

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地草稿。"));
  });
}

export async function loadCommunityDraft(accountId: number) {
  const database = await openDraftDatabase();
  if (!database) return null;

  return new Promise<CommunityDraft | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(String(accountId));
    request.onsuccess = () => resolve((request.result as CommunityDraft | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地草稿。"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveCommunityDraft(accountId: number, draft: CommunityDraft) {
  const database = await openDraftDatabase();
  if (!database) return false;

  return new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft, String(accountId));
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("无法保存本地草稿。")); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("本地草稿保存已取消。")); };
  });
}

export async function clearCommunityDraft(accountId: number) {
  const database = await openDraftDatabase();
  if (!database) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(String(accountId));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("无法清除已发布草稿。")); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("草稿清除已取消。")); };
  });
}
