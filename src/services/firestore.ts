import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  DocumentData,
} from 'firebase/firestore';
import type { AppData, Act, Player, Season, Sat } from '../types';

export async function fsGet<T extends DocumentData>(col: string): Promise<(T & { _id: string })[]> {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ _id: d.id, ...d.data() } as T & { _id: string }));
}

export async function fsSet(col: string, id: string, data: DocumentData): Promise<void> {
  await setDoc(doc(db, col, id), data);
}

export async function fsDel(col: string, id: string): Promise<void> {
  await deleteDoc(doc(db, col, id));
}

const SK = 'act-data-v4';

export function saveLocal(d: AppData): void {
  try {
    localStorage.setItem(SK, JSON.stringify(d));
  } catch {
    // ignore
  }
}

export function loadLocal(): AppData | null {
  try {
    const r = localStorage.getItem(SK);
    return r ? (JSON.parse(r) as AppData) : null;
  } catch {
    return null;
  }
}

export async function loadAllData(): Promise<{
  data: AppData;
  source: 'firebase' | 'local';
}> {
  try {
    const [acts, players, seasons, sats] = await Promise.all([
      fsGet('acts'),
      fsGet('players'),
      fsGet('seasons'),
      fsGet('sats'),
    ]);
    const data: AppData = {
      acts: acts as Act[],
      players: players as Player[],
      seasons: seasons as Season[],
      sats: sats as Sat[],
    };
    saveLocal(data);
    return { data, source: 'firebase' };
  } catch (e) {
    console.error('Firebase failed:', e);
    const local = loadLocal();
    return {
      data: local ?? {
        acts: [],
        players: [],
        seasons: [],
        sats: [],
      },
      source: 'local',
    };
  }
}

export function gid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function getAdminConfig(): Promise<{
  password?: string;
  Password?: string;
  pw?: string;
} | null> {
  const snap = await getDoc(doc(db, 'config', 'admin'));
  return snap.exists() ? snap.data() : null;
}

export async function getMenuImages(): Promise<Record<string, string>> {
  const snap = await getDoc(doc(db, 'config', 'menuImages'));
  return snap.exists() ? (snap.data() as Record<string, string>) : {};
}

// Upload a file to Firebase Storage and return its public download URL
export async function uploadMenuImage(key: string, file: File): Promise<string> {
  const storageRef = ref(storage, `menuImages/${key}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Delete a file from Firebase Storage (best-effort, ignores missing-file errors)
export async function deleteMenuImage(key: string): Promise<void> {
  try {
    await deleteObject(ref(storage, `menuImages/${key}`));
  } catch {
    // file may not exist — ignore
  }
}
