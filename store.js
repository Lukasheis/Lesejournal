// store.js – Daten in localStorage (JSON), Fotos in IndexedDB, Backup
import { migrate, emptyData, uid, validateBackup, APP_VERSION, dayKey } from './core.js';

const KEY = 'lesejournal.v1';
let data = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? migrate(JSON.parse(raw)) : emptyData();
  } catch (e) {
    console.error(e);
    data = emptyData();
  }
  return data;
}

export function get() { return data || load(); }

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    alert('Speichern fehlgeschlagen: Der Speicher ist voll. Bitte ein Backup erstellen und alte Fotos löschen.');
    throw e;
  }
  for (const fn of listeners) fn(data);
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Ändern und speichern in einem Schritt */
export function update(fn) { fn(data); save(); }

export function hasContent() {
  return data.books.length > 0 || data.quotes.length > 0 || data.sessions.length > 0;
}

/* ---------- Abfragen ---------- */

export function book(id) { return data.books.find(b => b.id === id) || null; }
export function sessionsOf(bookId) { return data.sessions.filter(s => s.bookId === bookId).sort((a, b) => b.end - a.end); }
export function quotesOf(bookId) { return data.quotes.filter(q => q.bookId === bookId).sort((a, b) => (a.page || 0) - (b.page || 0)); }
export function readingBooks() {
  const last = new Map();
  for (const s of data.sessions) last.set(s.bookId, Math.max(last.get(s.bookId) || 0, s.end || 0));
  return data.books.filter(b => b.status === 'reading')
    .sort((a, b) => (last.get(b.id) || b.startedAt || 0) - (last.get(a.id) || a.startedAt || 0));
}

/* ---------- Bücher ---------- */

export function addBook(fields) {
  const now = Date.now();
  const b = {
    id: uid(), title: '', author: '', isbn: '', totalPages: 0, currentPage: 0,
    totalChapters: 0, currentChapter: 0, status: 'reading', coverId: null, backId: null,
    blurb: '', addedAt: now, startedAt: null, finishedAt: null, rating: null, reflection: null,
    ...fields,
  };
  if (b.status === 'reading' && !b.startedAt) b.startedAt = now;
  if (b.status === 'finished' && !b.finishedAt) { b.finishedAt = now; b.currentPage = b.totalPages; }
  update(d => d.books.push(b));
  return b;
}

export function updateBook(id, fields) {
  update(d => {
    const b = d.books.find(x => x.id === id);
    if (b) Object.assign(b, fields);
  });
}

export async function deleteBook(id) {
  const b = book(id);
  if (!b) return;
  for (const pid of [b.coverId, b.backId]) if (pid) await deletePhoto(pid);
  update(d => {
    d.books = d.books.filter(x => x.id !== id);
    d.sessions = d.sessions.filter(s => s.bookId !== id);
    d.quotes = d.quotes.filter(q => q.bookId !== id);
    if (d.activeSession && d.activeSession.bookId === id) d.activeSession = null;
  });
}

/* ---------- Sessions ---------- */

export function addSession(s) {
  const entry = { id: uid(), note: '', chapter: '', ...s };
  update(d => {
    d.sessions.push(entry);
    const b = d.books.find(x => x.id === entry.bookId);
    if (b) {
      if (entry.toPage != null && entry.toPage > (b.currentPage || 0)) b.currentPage = entry.toPage;
      if (entry.chapterNum && entry.chapterNum > (b.currentChapter || 0)) b.currentChapter = entry.chapterNum;
      if (b.status === 'want') { b.status = 'reading'; b.startedAt = b.startedAt || entry.start; }
    }
  });
  return entry;
}

export function updateSession(id, fields) {
  update(d => { const s = d.sessions.find(x => x.id === id); if (s) Object.assign(s, fields); });
}

export function deleteSession(id) {
  update(d => { d.sessions = d.sessions.filter(s => s.id !== id); });
}

/* ---------- Zitate ---------- */

export function addQuote(q) {
  const entry = { id: uid(), text: '', page: null, chapter: '', fav: false, createdAt: Date.now(), ...q };
  update(d => d.quotes.push(entry));
  return entry;
}

export function updateQuote(id, fields) {
  update(d => { const q = d.quotes.find(x => x.id === id); if (q) Object.assign(q, fields); });
}

export function deleteQuote(id) {
  update(d => { d.quotes = d.quotes.filter(q => q.id !== id); });
}

/* ---------- Einstellungen ---------- */

export function setSetting(key, value) { update(d => { d.settings[key] = value; }); }

/* ---------- Fotos (IndexedDB) ---------- */

let dbPromise = null;
function idb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('lesejournal-fotos', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('photos', mode);
    const store = t.objectStore('photos');
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

export async function putPhoto(blob, id = uid()) { await tx('readwrite', s => s.put(blob, id)); urlCache.delete(id); return id; }
export async function getPhoto(id) { return id ? tx('readonly', s => s.get(id)) : null; }
export async function deletePhoto(id) { urlCache.delete(id); return tx('readwrite', s => s.delete(id)); }
async function allPhotoIds() { return tx('readonly', s => s.getAllKeys()); }

const urlCache = new Map();
export async function photoUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await getPhoto(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

/** Foto verkleinern (längste Seite max) und als JPEG speichern */
export async function resizeImage(file, max = 900, quality = 0.82) {
  const bmp = await loadImage(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

/* ---------- Backup ---------- */

export async function createBackupFile() {
  const photos = {};
  const used = new Set(data.books.flatMap(b => [b.coverId, b.backId]).filter(Boolean));
  for (const id of used) {
    const blob = await getPhoto(id);
    if (blob) photos[id] = await blobToDataUrl(blob);
  }
  const payload = { app: 'lesejournal', appVersion: APP_VERSION, exportedAt: Date.now(), data, photos };
  const json = JSON.stringify(payload);
  const name = `Lesejournal-Backup-${dayKey(Date.now())}.json`;
  return new File([json], name, { type: 'application/json' });
}

export function markBackupDone() { setSetting('lastBackup', Date.now()); }

export async function restoreBackup(file) {
  const text = await file.text();
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Die Datei konnte nicht gelesen werden (kein JSON).'); }
  const { data: newData, photos } = validateBackup(obj);
  // Fotos zuerst schreiben, dann Daten ersetzen
  const old = await allPhotoIds();
  for (const id of old) await deletePhoto(id);
  for (const [id, url] of Object.entries(photos)) await putPhoto(await dataUrlToBlob(url), id);
  data = newData;
  save();
}

export async function wipeAll() {
  const ids = await allPhotoIds();
  for (const id of ids) await deletePhoto(id);
  data = emptyData();
  save();
}

/** Speicher dauerhaft machen und Belegung schätzen */
export async function persistStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      return already || (await navigator.storage.persist());
    }
  } catch (e) { /* ignorieren */ }
  return false;
}

export async function storageInfo() {
  const out = { persisted: false, usage: null, quota: null };
  try {
    if (navigator.storage) {
      if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
      if (navigator.storage.estimate) Object.assign(out, await navigator.storage.estimate());
    }
  } catch (e) { /* ignorieren */ }
  return out;
}
