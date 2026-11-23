// club.js – Buchclubs: Verbindung zu Firebase (nur Club-Daten), Live-Stand und Abgleich.
// Man kann in mehreren Clubs sein. Live mitgehört wird der gerade gewählte Club,
// der eigene Lesestand wird an alle Clubs gesendet.
// Geteilt wird nur: Name, verknüpfte Clubbücher (Titel, Seite, Tempo, Beginn/Ende), Status,
// Sterne und selbst geteilte Zitate. Notizen, Fazit, Fotos und alle anderen Bücher bleiben am iPhone.
import * as store from './store.js';
import { FIREBASE_CONFIG } from './club-config.js';
import { makeClubCode, clubSnapshot, clubEntry, slugify, dayKey, addDays } from './core.js';

const FB_VERSION = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
const CACHE_KEY = 'lesejournal.clubcache2';

export const isConfigured = () => !!(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);

/** Was die Ansicht vom gewählten Club anzeigt */
export const live = { code: null, group: null, members: [], hearts: [], quotes: [], books: [], uid: null, status: 'idle', error: null, updatedAt: null };

let backend = null;
let connecting = null;
let unsub = null;
let demo = null;
let pubTimer = null;
const lastPub = new Map();   // code → zuletzt gesendeter Stand
const ensured = new Set();   // code/slug → Clubbuch existiert sicher
const listeners = new Set();

export function onLive(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() {
  if (!demo && live.code && live.group) {
    try {
      const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      all[live.code] = { group: live.group, members: live.members, hearts: live.hearts, quotes: live.quotes, books: live.books, uid: live.uid, updatedAt: live.updatedAt };
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* egal */ }
  }
  for (const fn of listeners) fn(live);
}

/* ---------- Meine Clubs (lokal) ---------- */

export const isDemo = () => !!demo;
export function clubs() { return demo ? demo.clubs : store.get().clubs; }
export function activeCode() {
  const list = clubs();
  if (demo) return demo.clubs[0].code;
  const a = store.get().activeClub;
  return list.some(c => c.code === a) ? a : (list[0] ? list[0].code : null);
}
export function info(code = activeCode()) { return clubs().find(c => c.code === code) || null; }

/** Felder meines Eintrags in einem Club ändern (lokal); danach wird automatisch gesendet */
export function setInfo(fields, code = activeCode()) {
  if (demo) { Object.assign(demo.clubs.find(c => c.code === code), fields); schedulePublish(50); emit(); return; }
  store.update(d => { const c = d.clubs.find(x => x.code === code); if (c) Object.assign(c, fields); });
}

function addClub(code, name) {
  store.update(d => {
    if (!d.clubs.some(c => c.code === code)) d.clubs.push(clubEntry(code, name));
    d.activeClub = code;
  });
}

function resetLive() { Object.assign(live, { code: null, group: null, members: [], hearts: [], quotes: [], books: [], status: 'idle', error: null, updatedAt: null }); }

function friendlyError(err) {
  const c = (err && err.code) || '';
  const m = (err && err.message) || '';
  if (c.includes('permission-denied') || /insufficient permissions/i.test(m)) return 'Der Club-Server hat das abgelehnt. Bitte die neuen Firebase-Regeln einfügen (ANLEITUNG 10.3, Schritt 5).';
  if (c.includes('api-key') || c.includes('invalid-api-key') || c.includes('project-not-found') || c.includes('configuration-not-found')) return 'Die Firebase-Werte in club-config.js stimmen nicht oder die Anmeldung ist nicht eingerichtet.';
  if (c.includes('operation-not-allowed') || c.includes('admin-restricted')) return 'In Firebase ist die anonyme Anmeldung noch nicht eingeschaltet.';
  if (c.includes('network') || c.includes('unavailable') || !navigator.onLine) return 'Keine Internetverbindung. Du siehst den letzten Stand.';
  return m || 'Verbindung fehlgeschlagen.';
}

/** Fehler aus Firebase in verständliche Meldungen übersetzen */
const guard = fn => async (...args) => {
  try { return await fn(...args); } catch (err) { console.warn('Club:', err); throw new Error(friendlyError(err)); }
};

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
  const sub = (code, coll, id) => F.doc(db, 'groups', code, coll, id);
  return {
    uid,
    async getGroup(code) { const s = await F.getDoc(g(code)); return s.exists() ? s.data() : null; },
    createGroup: (code, data) => F.setDoc(g(code), data),
    updateGroup: (code, fields) => F.updateDoc(g(code), fields),
    putMember: (code, data) => F.setDoc(sub(code, 'members', uid), data),
    deleteMember: (code, id) => F.deleteDoc(sub(code, 'members', id)),
    setHeart(code, to, statusAt, on) {
      const ref = sub(code, 'hearts', `${uid}_${to}`);
      return on ? F.setDoc(ref, { from: uid, to, statusAt }) : F.deleteDoc(ref);
    },
    putQuote: (code, id, data) => F.setDoc(sub(code, 'quotes', id), data),
    deleteQuote: (code, id) => F.deleteDoc(sub(code, 'quotes', id)),
    async getBook(code, slug) { const s = await F.getDoc(sub(code, 'books', slug)); return s.exists() ? s.data() : null; },
    putBook: (code, slug, data) => F.setDoc(sub(code, 'books', slug), data),
    updateBook: (code, slug, fields) => F.updateDoc(sub(code, 'books', slug), fields),
    deleteBook: (code, slug) => F.deleteDoc(sub(code, 'books', slug)),
    watch(code, cb, onErr) {
      const st = { group: undefined, members: null, hearts: [], quotes: [], books: [] };
      const fire = () => { if (st.group !== undefined && st.members) cb({ ...st }); };
      const col = name => F.collection(db, 'groups', code, name);
      const offs = [
        F.onSnapshot(g(code), s => { st.group = s.exists() ? s.data() : null; fire(); }, onErr),
        F.onSnapshot(col('members'), s => { st.members = s.docs.map(d => ({ uid: d.id, ...d.data() })); fire(); }, onErr),
        F.onSnapshot(col('hearts'), s => { st.hearts = s.docs.map(d => d.data()); fire(); }, onErr),
        F.onSnapshot(col('quotes'), s => { st.quotes = s.docs.map(d => ({ id: d.id, ...d.data() })); fire(); }, onErr),
        F.onSnapshot(col('books'), s => { st.books = s.docs.map(d => ({ slug: d.id, ...d.data() })); fire(); }, onErr),
      ];
      return () => offs.forEach(f => f());
    },
  };
}

/* ---------- Vorschau mit Beispieldaten (ohne Internet) ---------- */

function makeDemo() {
  const now = Date.now();
  const h = 3600000, d = 86400000;
  const day = n => dayKey(addDays(new Date(now), n).getTime());
  const B1 = { title: 'Die Bibliothek am Fluss', author: 'Marlene Hofer', total: 384 };
  const B2 = { title: 'Das Haus der Wellen', author: 'Jonas Berger', total: 256 };
  const e = (b, page, pace, extra = {}) => ({ ...b, page, progress: Math.round(page / b.total * 1000) / 1000, pace, startedAt: now - 14 * d, finishedAt: null, ...extra });
  const s1 = slugify(B1.title), s2 = slugify(B2.title);
  const m = (uid, name, reading, extra = {}) => ({ uid, name, reading, ratings: {}, status: '', statusAt: null, updatedAt: now - 2 * h, ...extra });
  const state = {
    group: { name: 'Buchclub Donnerstag', createdBy: 'anna', createdAt: now - 120 * d, meetingDate: day(9), meetingNote: '19 Uhr bei Anna', roundStart: now - 14 * d },
    books: [
      { slug: s1, ...B1, status: 'current', start: day(-14), end: null, addedBy: 'anna', addedAt: now - 14 * d },
      { slug: s2, ...B2, status: 'current', start: day(-6), end: null, addedBy: 'mira', addedAt: now - 6 * d },
      { slug: 'die-farbe-des-nebels', title: 'Die Farbe des Nebels', author: 'Ida Lorenz', total: 312, status: 'done', start: day(-60), end: day(-20), addedBy: 'anna', addedAt: now - 60 * d },
      { slug: 'winter-am-see', title: 'Winter am See', author: 'Clara Weiss', total: 280, status: 'done', start: day(-110), end: day(-70), addedBy: 'jakob', addedAt: now - 110 * d },
    ],
    members: [
      m('anna', 'Anna', { [s1]: e(B1, 271, 31) }, { status: 'Kann es nicht weglegen!', statusAt: now - 5 * h, updatedAt: now - 40 * 60000, ratings: { 'die-farbe-des-nebels': 4.5, 'winter-am-see': 3.5 } }),
      m('mira', 'Mira', { [s1]: e(B1, 384, 42, { progress: 1, finishedAt: now - 2 * d }), [s2]: e(B2, 120, 25) }, { ratings: { [s1]: 4.5, 'die-farbe-des-nebels': 5, 'winter-am-see': 4 } }),
      m('jakob', 'Jakob', { [s1]: e(B1, 158, 12) }, { status: 'Kapitel 9 zieht sich etwas …', statusAt: now - 26 * h, updatedAt: now - 26 * h, ratings: { 'die-farbe-des-nebels': 3, 'winter-am-see': 4 } }),
      m('sophie', 'Sophie', { [s1]: e(B1, 232, 18), [s2]: e(B2, 64, 11) }, { ratings: { 'die-farbe-des-nebels': 4 } }),
      m('paul', 'Paul', { [s1]: e(B1, 69, 6) }, { updatedAt: now - 3 * d }),
    ],
    hearts: [
      { from: 'mira', to: 'anna', statusAt: now - 5 * h }, { from: 'sophie', to: 'anna', statusAt: now - 5 * h },
      { from: 'anna', to: 'jakob', statusAt: now - 26 * h },
    ],
    quotes: [
      { id: 'anna_1', from: 'anna', name: 'Anna', text: 'Manche Türen öffnen sich erst, wenn man aufhört, an ihnen zu rütteln.', bookTitle: B1.title, bookAuthor: B1.author, page: 112, chapter: '7', createdAt: now - 30 * h },
      { id: 'mira_1', from: 'mira', name: 'Mira', text: 'Der Fluss erinnert sich an alles, was wir vergessen wollen.', bookTitle: B1.title, bookAuthor: B1.author, page: 301, chapter: '22', createdAt: now - 3 * h },
    ],
  };
  let cb = null;
  const copy = () => ({ group: { ...state.group }, members: state.members.map(x => ({ ...x })), hearts: state.hearts.slice(), quotes: state.quotes.map(x => ({ ...x })), books: state.books.map(x => ({ ...x })) });
  const fire = () => cb && setTimeout(() => cb && cb(copy()), 0);
  return {
    clubs: [{ ...clubEntry('DEMO2345', 'Du') }],
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
    async putQuote(code, id, data) { state.quotes = state.quotes.filter(x => x.id !== id).concat({ id, ...data }); fire(); },
    async deleteQuote(code, id) { state.quotes = state.quotes.filter(x => x.id !== id); fire(); },
    async getBook(code, slug) { return state.books.find(b => b.slug === slug) || null; },
    async putBook(code, slug, data) { state.books = state.books.filter(b => b.slug !== slug).concat({ slug, ...data }); fire(); },
    async updateBook(code, slug, f) { Object.assign(state.books.find(b => b.slug === slug) || {}, f); fire(); },
    async deleteBook(code, slug) { state.books = state.books.filter(b => b.slug !== slug); fire(); },
    watch(code, fn) { cb = fn; fire(); return () => { cb = null; }; },
  };
}

export function startDemo() {
  stopWatching();
  demo = makeDemo();
  backend = demo;
  live.uid = demo.uid;
  watch(demo.clubs[0].code);
  publishAll(true);
}

export function stopDemo() {
  stopWatching();
  demo = null; backend = null; lastPub.clear();
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

function loadCache(code) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[code];
    if (c) Object.assign(live, c);
  } catch (e) { /* egal */ }
}

function watch(code) {
  stopWatching();
  resetLive();
  live.code = code;
  live.uid = backend ? backend.uid : live.uid;
  if (!demo) loadCache(code);
  live.status = 'connecting';
  emit();
  unsub = backend.watch(code, st => {
    if (live.code !== code) return;
    Object.assign(live, st, { status: 'live', error: null, updatedAt: Date.now() });
    emit();
  }, err => {
    if (live.code !== code) return;
    live.status = 'error'; live.error = friendlyError(err); emit();
  });
}

export function schedulePublish(delay = 1500) {
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => publishAll().catch(err => console.warn('Club:', err)), delay);
}

/** Eigenen Stand an einen Club senden (nur wenn sich etwas geändert hat) */
async function publish(code, force = false) {
  const entry = info(code);
  if (!entry || !backend) return;
  const snap = clubSnapshot(store.get(), entry);
  const key = JSON.stringify(snap);
  if (!force && lastPub.get(code) === key) return;
  lastPub.set(code, key);
  try { await backend.putMember(code, { ...snap, updatedAt: Date.now() }); }
  catch (err) { lastPub.delete(code); throw err; }
  // Bücher, die ich verknüpft habe, müssen im Regal stehen (z. B. nach dem Umstieg von Version 1.2)
  for (const [slug, e] of Object.entries(snap.reading)) {
    const k = `${code}/${slug}`;
    if (ensured.has(k)) continue;
    if (code === live.code && live.books.some(b => b.slug === slug)) { ensured.add(k); continue; }
    try {
      if (!(await backend.getBook(code, slug))) {
        await backend.putBook(code, slug, { title: e.title, author: e.author || '', total: e.total || 0, status: e.finishedAt ? 'done' : 'current',
          start: e.startedAt ? dayKey(e.startedAt) : null, end: null, addedBy: backend.uid, addedAt: Date.now() });
      }
      ensured.add(k);
    } catch (err) { console.warn('Club-Regal:', err); }
  }
}

async function publishAll(force = false) {
  for (const c of clubs()) await publish(c.code, force).catch(err => console.warn('Club', c.code, err));
}

/** Beim App-Start: letzten Stand zeigen, verbinden, live mithören */
export function init() {
  store.onChange(() => { if (backend && clubs().length) schedulePublish(); });
  if (!clubs().length || !isConfigured()) return;
  live.code = activeCode();
  loadCache(live.code);
  live.status = 'connecting';
  connect().then(() => { watch(activeCode()); return publishAll(true); }).catch(err => console.warn('Club:', err));
  addEventListener('online', () => { if (backend && activeCode()) { watch(activeCode()); publishAll(true).catch(() => {}); } });
}

/** Anderen Club anzeigen */
export async function switchTo(code) {
  if (demo || code === live.code) return;
  store.update(d => { d.activeClub = code; });
  await connect();
  watch(code);
}

/* ---------- Aktionen ---------- */

export const createGroup = guard(async ({ groupName, name }) => {
  const b = await connect();
  let code = makeClubCode();
  for (let n = 0; n < 5 && await b.getGroup(code); n++) code = makeClubCode();
  await b.createGroup(code, { name: groupName, createdBy: b.uid, createdAt: Date.now(), meetingDate: null, meetingNote: '', roundStart: Date.now() });
  addClub(code, name);
  watch(code);
  await publish(code, true);
  return code;
});

export const joinGroup = guard(async ({ code, name }) => {
  const b = await connect();
  const g = await b.getGroup(code);
  if (!g) throw new Error('Diese Gruppe gibt es nicht. Bitte den Code prüfen.');
  addClub(code, name);
  watch(code);
  await publish(code, true);
  return g;
});

export async function leaveGroup(code = activeCode()) {
  if (backend) { try { await backend.deleteMember(code, backend.uid); } catch (e) { /* offline: egal */ } }
  lastPub.delete(code);
  try { const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); delete all[code]; localStorage.setItem(CACHE_KEY, JSON.stringify(all)); } catch (e) { /* egal */ }
  if (demo) { stopDemo(); return; }
  stopWatching();
  store.update(d => {
    d.clubs = d.clubs.filter(c => c.code !== code);
    if (d.activeClub === code) d.activeClub = d.clubs[0] ? d.clubs[0].code : null;
  });
  resetLive();
  if (activeCode() && backend) watch(activeCode()); else emit();
}

export const removeMember = guard(async uid => { await backend.deleteMember(live.code, uid); });

export const setMeeting = guard(async ({ date, note }) => {
  const fields = { meetingDate: date || null, meetingNote: note || '' };
  if (date && date !== (live.group && live.group.meetingDate)) fields.roundStart = Date.now();
  await (await connect()).updateGroup(live.code, fields);
});

export const renameGroup = guard(async name => { await (await connect()).updateGroup(live.code, { name }); });

export const toggleHeart = guard(async (toUid, statusAt, on) => { await (await connect()).setHeart(live.code, toUid, statusAt, on); });

export const isAdmin = () => !!(live.group && live.uid && live.group.createdBy === live.uid);

/* ----- Club-Regal ----- */

const bookDoc = f => ({
  title: String(f.title || '').trim().slice(0, 120),
  author: String(f.author || '').trim().slice(0, 80),
  total: Number(f.total) || 0,
  status: f.status === 'done' ? 'done' : 'current',
  start: f.start || null,
  end: f.end || null,
});

/** Clubbuch anlegen (gibt es den Titel schon, wird das vorhandene genommen) */
export const addClubBook = guard(async fields => {
  const b = await connect();
  const doc = bookDoc(fields);
  if (!doc.title) throw new Error('Bitte einen Titel eintragen');
  const slug = slugify(doc.title);
  const existing = live.books.find(x => x.slug === slug) || await b.getBook(live.code, slug);
  if (!existing) await b.putBook(live.code, slug, { ...doc, addedBy: b.uid, addedAt: Date.now() });
  ensured.add(`${live.code}/${slug}`);
  return { slug, existed: !!existing };
});

export const updateClubBook = guard(async (slug, fields) => {
  const b = await connect();
  const cur = live.books.find(x => x.slug === slug);
  if (cur) await b.updateBook(live.code, slug, bookDoc({ ...cur, ...fields }));
  else await b.putBook(live.code, slug, { ...bookDoc(fields), addedBy: b.uid, addedAt: Date.now() });
});

export const deleteClubBook = guard(async slug => {
  await (await connect()).deleteBook(live.code, slug);
  ensured.delete(`${live.code}/${slug}`);
  const e = info(live.code);
  if (e && (e.links[slug] || e.ratings[slug])) {
    const links = { ...e.links }, ratings = { ...e.ratings };
    delete links[slug]; delete ratings[slug];
    setInfo({ links, ratings }, live.code);
  }
});

/** Mein Exemplar mit einem Clubbuch verknüpfen (oder lösen mit bookId = null) */
export function linkBook(slug, bookId, code = live.code) {
  const e = info(code);
  if (!e) return;
  const links = { ...e.links };
  if (bookId) links[slug] = bookId; else delete links[slug];
  setInfo({ links }, code);
}

/** Sterne im Club (für Bücher ohne eigenes Exemplar); 0 entfernt sie */
export function setClubRating(slug, value, code = live.code) {
  const e = info(code);
  if (!e) return;
  const ratings = { ...e.ratings };
  if (value > 0) ratings[slug] = value; else delete ratings[slug];
  setInfo({ ratings }, code);
}

/* ----- Zitate ----- */

/** Meine Zitate im Club teilen (gleiches Zitat = gleicher Eintrag, keine Doppelten) */
export const shareQuotes = guard(async quotes => {
  const b = await connect();
  const e = info(live.code);
  let n = 0;
  for (const q of quotes) {
    const book = store.book(q.bookId);
    const page = Number(q.page);
    await b.putQuote(live.code, `${b.uid}_${q.id}`, {
      from: b.uid, localId: q.id,
      name: String((e && e.name) || 'Mitglied').slice(0, 30),
      text: String(q.text || '').trim().slice(0, 600),
      bookTitle: book ? String(book.title || '').slice(0, 120) : '',
      bookAuthor: book ? String(book.author || '').slice(0, 80) : '',
      page: page > 0 ? page : null,
      chapter: String(q.chapter || '').slice(0, 20),
      createdAt: Date.now() + n++,
    });
  }
  return n;
});

export const deleteClubQuote = guard(async id => { await (await connect()).deleteQuote(live.code, id); });
