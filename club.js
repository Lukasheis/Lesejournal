// club.js – Buchclub: Verbindung zu Firebase (nur Club-Daten), Live-Stand und Abgleich.
// Geteilt wird nur: Name, Clubbuch (Titel/Autor), Seite, Tempo, Status, nach dem Lesen Sterne + Fazit.
// Notizen, Zitate, Fotos und alle anderen Bücher bleiben am iPhone.
import * as store from './store.js';
import { FIREBASE_CONFIG } from './club-config.js';
import { makeClubCode, clubSnapshot, dayKey, addDays } from './core.js';

const FB_VERSION = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
const CACHE_KEY = 'lesejournal.clubcache';

export const isConfigured = () => !!(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);

/** Was die Ansicht anzeigt */
export const live = { group: null, members: [], hearts: [], uid: null, status: 'idle', error: null, updatedAt: null };

let backend = null;
let connecting = null;
let unsub = null;
let demo = null;
let pubTimer = null;
let lastPub = null;
const listeners = new Set();

export function onLive(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() {
  if (!demo && info().code && live.group) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ code: info().code, group: live.group, members: live.members, hearts: live.hearts, uid: live.uid, updatedAt: live.updatedAt })); } catch (e) { /* egal */ }
  }
  for (const fn of listeners) fn(live);
}

export const isDemo = () => !!demo;
export function info() { return demo ? demo.info : store.get().club; }
export function setInfo(fields) {
  if (demo) { Object.assign(demo.info, fields); schedulePublish(50); emit(); }
  else store.update(d => Object.assign(d.club, fields));
}

function resetLive() { Object.assign(live, { group: null, members: [], hearts: [], status: 'idle', error: null, updatedAt: null }); }

function friendlyError(err) {
  const c = (err && err.code) || '';
  if (c.includes('permission-denied')) return 'Kein Zugriff. Sind die Sicherheitsregeln in Firebase eingetragen?';
  if (c.includes('api-key') || c.includes('invalid-api-key') || c.includes('project-not-found') || c.includes('configuration-not-found')) return 'Die Firebase-Werte in club-config.js stimmen nicht oder die Anmeldung ist nicht eingerichtet.';
  if (c.includes('operation-not-allowed') || c.includes('admin-restricted')) return 'In Firebase ist die anonyme Anmeldung noch nicht eingeschaltet.';
  if (c.includes('network') || c.includes('unavailable') || !navigator.onLine) return 'Keine Internetverbindung. Du siehst den letzten Stand.';
  return (err && err.message) || 'Verbindung fehlgeschlagen.';
}

/* ---------- Firebase ---------- */

async function firebaseBackend() {
  const [{ initializeApp }, Au, F] = await Promise.all([
    import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = Au.initializeAuth(app, { persistence: [Au.indexedDBLocalPersistence, Au.browserLocalPersistence] });
  const user = await new Promise((res, rej) => { const off = Au.onAuthStateChanged(auth, u => { off(); res(u); }, rej); });
  const uid = user ? user.uid : (await Au.signInAnonymously(auth)).user.uid;
  const db = F.getFirestore(app);
  const g = code => F.doc(db, 'groups', code);
  return {
    uid,
    async getGroup(code) { const s = await F.getDoc(g(code)); return s.exists() ? s.data() : null; },
    createGroup: (code, data) => F.setDoc(g(code), data),
    updateGroup: (code, fields) => F.updateDoc(g(code), fields),
    putMember: (code, data) => F.setDoc(F.doc(db, 'groups', code, 'members', uid), data),
    deleteMember: (code, id) => F.deleteDoc(F.doc(db, 'groups', code, 'members', id)),
    setHeart(code, to, statusAt, on) {
      const ref = F.doc(db, 'groups', code, 'hearts', `${uid}_${to}`);
      return on ? F.setDoc(ref, { from: uid, to, statusAt }) : F.deleteDoc(ref);
    },
    watch(code, cb, onErr) {
      const st = { group: undefined, members: null, hearts: [] };
      const fire = () => { if (st.group !== undefined && st.members) cb({ ...st }); };
      const offs = [
        F.onSnapshot(g(code), s => { st.group = s.exists() ? s.data() : null; fire(); }, onErr),
        F.onSnapshot(F.collection(db, 'groups', code, 'members'), s => { st.members = s.docs.map(d => ({ uid: d.id, ...d.data() })); fire(); }, onErr),
        F.onSnapshot(F.collection(db, 'groups', code, 'hearts'), s => { st.hearts = s.docs.map(d => d.data()); fire(); }, onErr),
      ];
      return () => offs.forEach(f => f());
    },
  };
}

/* ---------- Vorschau mit Beispieldaten (ohne Internet) ---------- */

function makeDemo() {
  const now = Date.now();
  const h = 3600000, d = 86400000;
  const book = { bookTitle: 'Die Bibliothek am Fluss', bookAuthor: 'Marlene Hofer', total: 384 };
  const m = (uid, name, page, pace, extra = {}) => ({ uid, name, ...book, page, progress: Math.round(page / book.total * 1000) / 1000, pace, status: '', statusAt: null, finishedAt: null, rating: null, verdict: '', updatedAt: now - 2 * h, ...extra });
  const state = {
    group: { name: 'Buchclub Donnerstag', createdBy: 'anna', createdAt: now - 20 * d, meetingDate: dayKey(addDays(new Date(now), 9).getTime()), meetingNote: '19 Uhr bei Anna', roundStart: now - 14 * d },
    members: [
      m('anna', 'Anna', 271, 31, { status: 'Kann es nicht weglegen!', statusAt: now - 5 * h, updatedAt: now - 40 * 60000 }),
      m('mira', 'Mira', 384, 42, { progress: 1, finishedAt: now - 2 * d, rating: 4.5, verdict: 'Das Ende hat mich umgehauen. Ich freu mich aufs Treffen!', updatedAt: now - 2 * d }),
      m('jakob', 'Jakob', 158, 12, { status: 'Kapitel 9 zieht sich etwas …', statusAt: now - 26 * h, updatedAt: now - 26 * h }),
      m('sophie', 'Sophie', 232, 18),
      m('paul', 'Paul', 69, 6, { updatedAt: now - 3 * d }),
    ],
    hearts: [
      { from: 'mira', to: 'anna', statusAt: now - 5 * h }, { from: 'sophie', to: 'anna', statusAt: now - 5 * h },
      { from: 'anna', to: 'jakob', statusAt: now - 26 * h },
    ],
  };
  let cb = null;
  const fire = () => cb && setTimeout(() => cb({ group: { ...state.group }, members: state.members.map(x => ({ ...x })), hearts: state.hearts.slice() }), 0);
  return {
    info: { code: 'DEMO2345', name: 'Du', bookId: null, status: '', statusAt: null, verdict: '' },
    uid: 'me',
    async getGroup() { return state.group; },
    async createGroup() {},
    async updateGroup(code, f) { Object.assign(state.group, f); fire(); },
    async putMember(code, data) { state.members = state.members.filter(x => x.uid !== 'me').concat({ uid: 'me', ...data }); fire(); },
    async deleteMember(code, id) { state.members = state.members.filter(x => x.uid !== id); fire(); },
    async setHeart(code, to, statusAt, on) {
      state.hearts = state.hearts.filter(x => !(x.from === 'me' && x.to === to));
      if (on) state.hearts.push({ from: 'me', to, statusAt });
      fire();
    },
    watch(code, fn) { cb = fn; fire(); return () => { cb = null; }; },
  };
}

export function startDemo() {
  stopWatching();
  demo = makeDemo();
  backend = demo;
  live.uid = demo.uid;
  watch(demo.info.code);
  publish(true);
}

export function stopDemo() {
  stopWatching();
  demo = null; backend = null; lastPub = null;
  resetLive(); emit();
}

/* ---------- Verbindung & Abgleich ---------- */

async function connect() {
  if (backend) return backend;
  if (!isConfigured()) throw new Error('Der Buchclub ist noch nicht eingerichtet.');
  if (!connecting) {
    live.status = 'connecting'; emit();
    connecting = firebaseBackend()
      .then(b => { backend = b; live.uid = b.uid; return b; })
      .catch(err => { console.warn('Club:', err); connecting = null; live.status = 'error'; live.error = friendlyError(err); emit(); throw new Error(live.error); });
  }
  return connecting;
}

function stopWatching() { if (unsub) { unsub(); unsub = null; } }

function watch(code) {
  stopWatching();
  unsub = backend.watch(code, st => {
    Object.assign(live, st, { status: 'live', error: null, updatedAt: Date.now() });
    emit();
  }, err => {
    live.status = 'error'; live.error = friendlyError(err); emit();
  });
}

export function schedulePublish(delay = 1500) {
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => publish().catch(err => console.warn('Club:', err)), delay);
}

/** Eigenen Stand an die Gruppe senden (nur wenn sich etwas geändert hat) */
export async function publish(force = false) {
  const i = info();
  if (!i.code || !backend) return;
  const d = store.get();
  const b = i.bookId ? d.books.find(x => x.id === i.bookId) : null;
  const snap = clubSnapshot(b, d.sessions, i);
  const key = JSON.stringify(snap);
  if (!force && key === lastPub) return;
  lastPub = key;
  try { await backend.putMember(i.code, { ...snap, updatedAt: Date.now() }); }
  catch (err) { lastPub = null; throw err; }
}

/** Beim App-Start: letzten Stand zeigen, verbinden, live mithören */
export function init() {
  store.onChange(() => { if (backend && info().code) schedulePublish(); });
  const i = info();
  if (!i.code || !isConfigured()) return;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.code === i.code) Object.assign(live, c, { status: 'connecting' });
  } catch (e) { /* egal */ }
  connect().then(() => { watch(i.code); return publish(true); }).catch(err => console.warn('Club:', err));
  // Wieder online → neu verbinden
  addEventListener('online', () => { if (backend && info().code) { watch(info().code); publish(true).catch(() => {}); } });
}

/* ---------- Aktionen ---------- */

export async function createGroup({ groupName, name }) {
  const b = await connect();
  let code = makeClubCode();
  for (let n = 0; n < 5 && await b.getGroup(code); n++) code = makeClubCode();
  await b.createGroup(code, { name: groupName, createdBy: b.uid, createdAt: Date.now(), meetingDate: null, meetingNote: '', roundStart: Date.now() });
  setInfo({ code, name });
  watch(code);
  await publish(true);
  return code;
}

export async function joinGroup({ code, name }) {
  const b = await connect();
  let g;
  try { g = await b.getGroup(code); } catch (err) { throw new Error(friendlyError(err)); }
  if (!g) throw new Error('Diese Gruppe gibt es nicht. Bitte den Code prüfen.');
  setInfo({ code, name });
  watch(code);
  await publish(true);
  return g;
}

export async function leaveGroup() {
  const i = info();
  if (backend && i.code) { try { await backend.deleteMember(i.code, backend.uid); } catch (e) { /* offline: egal */ } }
  stopWatching();
  lastPub = null;
  try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* egal */ }
  if (demo) { stopDemo(); return; }
  setInfo({ code: null, status: '', statusAt: null, verdict: '' });
  resetLive(); emit();
}

export async function removeMember(uid) { await backend.deleteMember(info().code, uid); }

export async function setMeeting({ date, note }) {
  const fields = { meetingDate: date || null, meetingNote: note || '' };
  if (date && date !== (live.group && live.group.meetingDate)) fields.roundStart = Date.now();
  await (await connect()).updateGroup(info().code, fields);
}

export async function renameGroup(name) { await (await connect()).updateGroup(info().code, { name }); }

export async function toggleHeart(toUid, statusAt, on) { await (await connect()).setHeart(info().code, toUid, statusAt, on); }

export const isAdmin = () => !!(live.group && live.uid && live.group.createdBy === live.uid);
