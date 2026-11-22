// core.js – reine Rechenlogik ohne DOM (mit jsc testbar)

export const APP_VERSION = '1.2.0';
export const DATA_VERSION = 1;

/* ---------- Zahlen & Datum (Deutsch/Österreich) ---------- */

export function fmtNum(n, decimals = 0) {
  if (n == null || !isFinite(n)) return '–';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  let [int, dec] = fixed.split('.');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + int + (dec ? ',' + dec : '');
}

export function parseNum(str) {
  if (typeof str === 'number') return str;
  if (str == null) return NaN;
  const s = String(str).trim().replace(/\s/g, '');
  if (!s) return NaN;
  // "12.000" = zwölftausend, "1.234,5" = 1234,5
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

export function pad2(n) { return String(n).padStart(2, '0'); }

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function dayKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  return d;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jän.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function fmtDate(ts, opts = {}) {
  if (ts == null) return '–';
  const d = new Date(ts);
  const m = opts.long ? MONTHS[d.getMonth()] : MONTHS_SHORT[d.getMonth()];
  const s = `${d.getDate()}. ${m}`;
  return opts.year === false ? s : `${s} ${d.getFullYear()}`;
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Dauer in Sekunden → "1 h 05 min" bzw. "25 min" */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} h ${pad2(m)} min`;
  if (m > 0) return `${m} min`;
  return sec > 0 ? `${sec} s` : '0 min';
}

/** Stoppuhr-Anzeige: "05:09" bzw. "1:05:09" */
export function fmtClock(sec) {
  const neg = sec < 0;
  sec = Math.abs(Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const body = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  return (neg ? '+' : '') + body;
}

export function greeting(ts) {
  const h = new Date(ts).getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

/* ---------- IDs ---------- */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- ISBN ---------- */

export function cleanIsbn(s) {
  return String(s || '').toUpperCase().replace(/[^0-9X]/g, '');
}

export function isValidIsbn13(s) {
  s = cleanIsbn(s);
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export function isValidIsbn10(s) {
  s = cleanIsbn(s);
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

export function isbn10to13(s) {
  s = cleanIsbn(s);
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}

/** Normalisiert auf ISBN-13 oder gibt null zurück */
export function normalizeIsbn(s) {
  const c = cleanIsbn(s);
  if (isValidIsbn13(c) && (c.startsWith('978') || c.startsWith('979'))) return c;
  if (isValidIsbn10(c)) return isbn10to13(c);
  return null;
}

export function fmtIsbn(s) {
  const c = cleanIsbn(s);
  if (c.length === 13) return `${c.slice(0, 3)}-${c.slice(3, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12)}`;
  return c;
}

/* ---------- Buch-Fortschritt ---------- */

export function bookProgress(book) {
  if (!book) return 0;
  if (book.status === 'finished') return 1;
  const total = Number(book.totalPages) || 0;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(book.currentPage) || 0) / total));
}

export function pagesLeft(book) {
  return Math.max(0, (Number(book.totalPages) || 0) - (Number(book.currentPage) || 0));
}

/** Gelesene Seiten einer Session */
export function sessionPages(s) {
  if (s.pages != null) return Math.max(0, Number(s.pages) || 0);
  return Math.max(0, (Number(s.toPage) || 0) - (Number(s.fromPage) || 0));
}

/** Höchste Kapitelnummer aus einer Eingabe wie "7", "7–8", "Kap. 12" */
export function maxChapterNumber(text) {
  const nums = String(text || '').match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

/* ---------- Statistik ---------- */

/** Map dayKey → {pages, seconds, sessions} */
export function dailyTotals(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = dayKey(s.end || s.start);
    const cur = map.get(key) || { pages: 0, seconds: 0, sessions: 0 };
    cur.pages += sessionPages(s);
    cur.seconds += Number(s.durationSec) || 0;
    cur.sessions += 1;
    map.set(key, cur);
  }
  return map;
}

/** Ein Tag zählt als Lesetag, wenn Seiten gelesen ODER Zeit gelesen wurde */
export function readingDays(sessions) {
  const set = new Set();
  for (const [k, v] of dailyTotals(sessions)) if (v.pages > 0 || v.seconds >= 60) set.add(k);
  return set;
}

/** Serie: aktuelle (heute oder bis gestern) und längste */
export function streaks(sessions, now = Date.now()) {
  const days = readingDays(sessions);
  if (days.size === 0) return { current: 0, longest: 0, readToday: false };
  const today = new Date(startOfDay(now));
  const readToday = days.has(dayKey(today.getTime()));
  let current = 0;
  let d = readToday ? today : addDays(today, -1);
  while (days.has(dayKey(d.getTime()))) { current++; d = addDays(d, -1); }

  const sorted = [...days].sort();
  let longest = 0, run = 0, prev = null;
  for (const k of sorted) {
    const date = dayKeyToDate(k);
    if (prev && dayKey(addDays(prev, 1).getTime()) === k) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = date;
  }
  return { current, longest: Math.max(longest, current), readToday };
}

/** Tempo in Seiten pro Stunde aus Sessions mit Zeit und Seiten */
export function pagesPerHour(sessions) {
  let pages = 0, secs = 0;
  for (const s of sessions) {
    const p = sessionPages(s);
    const t = Number(s.durationSec) || 0;
    if (p > 0 && t >= 60) { pages += p; secs += t; }
  }
  if (secs < 60) return null;
  return pages / (secs / 3600);
}

/**
 * Prognose, wann ein Buch fertig ist.
 * Grundlage: Seiten pro Tag in den letzten `windowDays` Tagen (alle Bücher),
 * gezählt ab dem ersten Lesetag in diesem Fenster.
 */
export function finishForecast(book, sessions, now = Date.now(), windowDays = 14) {
  const left = pagesLeft(book);
  if (book.status !== 'reading' || !(book.totalPages > 0)) return null;
  if (left === 0) return { date: now, days: 0, perDay: null };
  const since = startOfDay(now) - (windowDays - 1) * 86400000;
  const recent = sessions.filter(s => (s.end || s.start) >= since);
  if (recent.length === 0) return null;
  const pages = recent.reduce((a, s) => a + sessionPages(s), 0);
  if (pages <= 0) return null;
  const first = Math.min(...recent.map(s => startOfDay(s.end || s.start)));
  const spanDays = Math.max(1, Math.round((startOfDay(now) - first) / 86400000) + 1);
  const perDay = pages / spanDays;
  const days = Math.ceil(left / perDay);
  return { date: addDays(new Date(startOfDay(now)), days).getTime(), days, perDay };
}

/** Gesamte Lesezeit in Sekunden */
export function totalSeconds(sessions) {
  return sessions.reduce((a, s) => a + (Number(s.durationSec) || 0), 0);
}

/** Wochen (Mo–So), die letzten n inkl. aktueller: [{start, pages, seconds}] */
export function weeklyTotals(sessions, n = 12, now = Date.now()) {
  const today = new Date(startOfDay(now));
  const dow = (today.getDay() + 6) % 7; // Mo = 0
  const thisMonday = addDays(today, -dow);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i).getTime();
    weeks.push({ start, end: addDays(new Date(start), 7).getTime(), pages: 0, seconds: 0 });
  }
  for (const s of sessions) {
    const t = s.end || s.start;
    const w = weeks.find(w => t >= w.start && t < w.end);
    if (w) { w.pages += sessionPages(s); w.seconds += Number(s.durationSec) || 0; }
  }
  return weeks;
}

/** Monate eines Jahres: [{month, pages, seconds, books}] */
export function monthlyTotals(sessions, books, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, pages: 0, seconds: 0, books: 0 }));
  for (const s of sessions) {
    const d = new Date(s.end || s.start);
    if (d.getFullYear() !== year) continue;
    months[d.getMonth()].pages += sessionPages(s);
    months[d.getMonth()].seconds += Number(s.durationSec) || 0;
  }
  for (const b of books) {
    if (b.status !== 'finished' || !b.finishedAt) continue;
    const d = new Date(b.finishedAt);
    if (d.getFullYear() === year) months[d.getMonth()].books++;
  }
  return months;
}

/**
 * Kalender-Heatmap: Spalten = Wochen (Mo oben), die letzten `weeks` Wochen.
 * Rückgabe: {cells:[{key, pages, seconds, level, future, col, row}], max}
 */
export function heatmap(sessions, weeks = 26, now = Date.now()) {
  const totals = dailyTotals(sessions);
  const today = new Date(startOfDay(now));
  const dow = (today.getDay() + 6) % 7;
  const start = addDays(today, -dow - 7 * (weeks - 1));
  const cells = [];
  let max = 0;
  for (let c = 0; c < weeks; c++) {
    for (let r = 0; r < 7; r++) {
      const d = addDays(start, c * 7 + r);
      const key = dayKey(d.getTime());
      const v = totals.get(key) || { pages: 0, seconds: 0 };
      const future = d.getTime() > today.getTime();
      max = Math.max(max, v.pages);
      cells.push({ key, date: d.getTime(), pages: v.pages, seconds: v.seconds, future, col: c, row: r, level: 0 });
    }
  }
  for (const cell of cells) cell.level = heatLevel(cell.pages, cell.seconds, max);
  return { cells, max };
}

export function heatLevel(pages, seconds, max) {
  if (pages <= 0) return seconds >= 60 ? 1 : 0;
  if (max <= 0) return 1;
  const r = pages / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

/** Jahresziel: Stand und ob im Plan */
export function yearGoalStatus(books, goal, year, now = Date.now()) {
  const done = books.filter(b => b.status === 'finished' && b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length;
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const frac = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expected = goal * frac;
  return { done, goal, progress: goal > 0 ? Math.min(1, done / goal) : 0, expected, ahead: Math.floor(done - expected) };
}

/** Jahresrückblick */
export function yearReview(data, year) {
  const { books, sessions, quotes } = data;
  const inYear = t => t && new Date(t).getFullYear() === year;
  const yearSessions = sessions.filter(s => inYear(s.end || s.start));
  const finished = books.filter(b => b.status === 'finished' && inYear(b.finishedAt));
  const pages = yearSessions.reduce((a, s) => a + sessionPages(s), 0);
  const seconds = totalSeconds(yearSessions);
  const months = monthlyTotals(sessions, books, year);
  const bestMonth = months.reduce((a, m) => (m.pages > a.pages ? m : a), months[0]);
  const top = [...finished].filter(b => b.rating && b.rating.overall)
    .sort((a, b) => b.rating.overall - a.rating.overall || (b.finishedAt - a.finishedAt)).slice(0, 3);
  const longest = finished.reduce((a, b) => (!a || (b.totalPages || 0) > (a.totalPages || 0) ? b : a), null);
  const days = readingDays(yearSessions);
  const yearQuotes = quotes.filter(q => inYear(q.createdAt));
  const favQuotes = yearQuotes.filter(q => q.fav);
  const authors = new Map();
  for (const b of finished) if (b.author) authors.set(b.author, (authors.get(b.author) || 0) + 1);
  const topAuthor = [...authors.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const { longest: longestStreak } = streaks(yearSessions, new Date(year, 11, 31, 12).getTime());
  return {
    year,
    booksFinished: finished.length,
    pages,
    seconds,
    sessions: yearSessions.length,
    readingDays: days.size,
    bestMonth: bestMonth.pages > 0 ? bestMonth : null,
    top,
    longest,
    quotesCount: yearQuotes.length,
    quote: favQuotes[0] || yearQuotes[0] || null,
    topAuthor: topAuthor && topAuthor[1] > 1 ? { name: topAuthor[0], count: topAuthor[1] } : null,
    longestStreak,
    tempo: pagesPerHour(yearSessions),
    months,
  };
}

/* ---------- Zitate ---------- */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Gleiches Zitat den ganzen Tag lang; Favoriten kommen doppelt so oft */
export function quoteOfDay(quotes, key, offset = 0) {
  if (!quotes.length) return null;
  const pool = [];
  for (const q of quotes) { pool.push(q); if (q.fav) pool.push(q); }
  return pool[(hashStr(key) + offset) % pool.length];
}

export function quoteSource(q, book) {
  const parts = [];
  if (book) parts.push(book.author ? `${book.author}, ${book.title}` : book.title);
  if (q.chapter) parts.push(`Kap. ${q.chapter}`);
  if (q.page) parts.push(`S. ${q.page}`);
  return parts.join(' · ');
}

/** Textdatei für den Kurzbefehl: ein Zitat pro Zeile */
export function quotesToText(quotes, books) {
  const byId = new Map(books.map(b => [b.id, b]));
  return quotes
    .map(q => {
      const text = String(q.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const src = quoteSource(q, byId.get(q.bookId));
      return `„${text}“${src ? ' – ' + src : ''}`;
    })
    .filter(Boolean)
    .join('\n') + '\n';
}

/* ---------- OCR-Hilfe ---------- */

/** Aus erkannten Zeilen [{text, height}] Titel/Autor vorschlagen */
export function suggestTitleAuthor(lines) {
  const clean = lines
    .map(l => ({ text: String(l.text || '').replace(/[|_~^*<>«»"“”„]/g, '').replace(/\s+/g, ' ').trim(), height: l.height || 0 }))
    .filter(l => l.text.length >= 2 && /[A-Za-zÄÖÜäöüß]{2,}/.test(l.text));
  if (!clean.length) return { title: '', author: '', lines: [] };
  // Größte Zeile + direkt angrenzende, ähnlich große Zeilen = Titel (mehrzeilige Titel)
  let top = 0;
  clean.forEach((l, i) => { if (l.height > clean[top].height) top = i; });
  const big = clean[top].height * 0.75;
  let from = top, to = top;
  while (from > 0 && clean[from - 1].height >= big) from--;
  while (to < clean.length - 1 && clean[to + 1].height >= big) to++;
  const titleLines = clean.slice(from, to + 1);
  const title = titleLines.map(l => l.text).join(' ');
  const rest = clean.filter(l => !titleLines.includes(l));
  const isName = t => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\.\-]+(\s+[A-ZÄÖÜ][\.A-Za-zÄÖÜäöüß\-]*){1,3}$/.test(t);
  const nameLike = rest.find(l => isName(l.text) && !/^(roman|erzählung|krimi|thriller)$/i.test(l.text));
  const byHeight = [...rest].sort((a, b) => b.height - a.height);
  const author = nameLike ? nameLike.text : (byHeight[0] ? byHeight[0].text : '');
  return { title: titleCase(title), author: titleCase(author), lines: clean.map(l => l.text) };
}

function titleCase(s) {
  // Nur reine GROSSBUCHSTABEN-Zeilen umwandeln
  if (s && s === s.toUpperCase() && /[A-ZÄÖÜ]{3,}/.test(s)) {
    return s.toLowerCase().replace(/(^|[\s\-])([a-zäöü])/g, (m, p, c) => p + c.toUpperCase());
  }
  return s;
}

/** Erkannter Fließtext → Absätze zusammenfügen, Silbentrennung entfernen */
export function cleanOcrText(text) {
  return String(text || '')
    .replace(/-\n(?=[a-zäöüß])/g, '')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

/* ---------- Farben & Paletten ---------- */

export const PALETTES = [
  { id: 'sunset', name: 'Abendrot', colors: ['#FF5E62', '#FF9966', '#8E54E9'] },
  { id: 'ocean', name: 'Ozean', colors: ['#0096C7', '#00C2A8', '#FFC94D'] },
  { id: 'forest', name: 'Wald', colors: ['#2F9E6E', '#9BCB5A', '#F2B84B'] },
  { id: 'candy', name: 'Bonbon', colors: ['#F2559B', '#A66CFF', '#3CCFCF'] },
  { id: 'autumn', name: 'Herbst', colors: ['#B23A48', '#E58E35', '#6B4E9B'] },
  { id: 'aurora', name: 'Polarlicht', colors: ['#5B5BF0', '#20C3D0', '#3ED68C'] },
  { id: 'citrus', name: 'Zitrus', colors: ['#FF8A00', '#FFC300', '#4CB944'] },
  { id: 'berry', name: 'Beerenmix', colors: ['#7B2CBF', '#E0479E', '#FF8C61'] },
  { id: 'lagoon', name: 'Lagune', colors: ['#1C7ED6', '#7950F2', '#F783AC'] },
  { id: 'mono', name: 'Graphit', colors: ['#4A5568', '#718096', '#A0AEC0'] },
];

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function pastelize(hex, dark = false) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const ns = Math.min(s, 0.75) * (dark ? 0.6 : 0.7);
  const nl = dark ? 0.72 : 0.78;
  return rgbToHex(hslToRgb([h, ns, nl]));
}

export function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Textfarbe auf einer Fläche: weiß oder dunkel */
export function onColor(hex) {
  return contrastRatio(hex, '#FFFFFF') >= 3 ? '#FFFFFF' : '#1B1530';
}

/** Akzentfarbe so anpassen, dass sie als Textfarbe auf dem Hintergrund lesbar ist (≥ 4,5:1) */
export function readableOn(hex, bg) {
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  const bgDark = relLuminance(bg) < 0.2;
  let out = hex;
  for (let i = 0; i < 40 && contrastRatio(out, bg) < 4.5; i++) {
    l = bgDark ? Math.min(0.95, l + 0.02) : Math.max(0.05, l - 0.02);
    out = rgbToHex(hslToRgb([h, s, l]));
  }
  return out;
}

/** Farbe abdunkeln, bis Text in `text`-Farbe darauf mindestens `ratio` Kontrast hat */
export function ensureContrast(hex, text, ratio) {
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  const lightText = relLuminance(text) > 0.5;
  let out = hex;
  for (let i = 0; i < 60 && contrastRatio(out, text) < ratio; i++) {
    l = lightText ? Math.max(0.05, l - 0.01) : Math.min(0.97, l + 0.01);
    out = rgbToHex(hslToRgb([h, s, l]));
  }
  return out;
}

/**
 * Komplettes Farbschema einer Palette für hell/dunkel und pastell.
 * c1–c3: Dekor (Ringe, Hintergrund, Diagramme)
 * f1–f3: Flächen mit Text darauf (Knöpfe, Karten) – kontrastgeprüft gegen onAccent
 */
export function themeColors(paletteId, { dark = false, pastel = false } = {}) {
  const p = PALETTES.find(x => x.id === paletteId) || PALETTES[0];
  const cols = pastel ? p.colors.map(c => pastelize(c, dark)) : p.colors.slice();
  const bg = dark ? '#0E0B16' : '#F6F4FA';
  const onAccent = pastel ? '#1B1530' : '#FFFFFF';
  const [f1, f2, f3] = cols.map(c => ensureContrast(c, onAccent, pastel ? 4.5 : 3.2));
  return {
    c1: cols[0], c2: cols[1], c3: cols[2],
    f1, f2, f3,
    accent: f1,
    onAccent,
    accentText: readableOn(p.colors[0], dark ? '#1A1625' : '#FFFFFF'),
    bg,
  };
}

/* ---------- Daten: Standard, Prüfung, Migration ---------- */

export const DEFAULT_QUESTIONS = [
  'Worum ging es – in einem Satz?',
  'Was nimmst du aus dem Buch mit?',
  'Welche Stelle oder Figur bleibt dir im Kopf?',
  'Was hat dich überrascht oder gestört?',
  'Wem würdest du das Buch empfehlen – und warum?',
];

export const RATING_CATEGORIES = [
  { id: 'story', name: 'Geschichte' },
  { id: 'style', name: 'Schreibstil' },
  { id: 'suspense', name: 'Spannung' },
  { id: 'emotion', name: 'Gefühl' },
];

export function defaultSettings() {
  return {
    theme: 'system',
    palette: 'sunset',
    pastel: false,
    iconStroke: 'normal',
    yearGoal: 24,
    dailyGoalPages: 20,
    defaultCountdownMin: 30,
    timerMode: 'stopwatch',
    focusShortcut: false,
    shortcutStart: 'Lesezeit',
    focusEndShortcut: true,
    shortcutEnd: 'Lesezeit Ende',
    reflectionQuestions: DEFAULT_QUESTIONS.slice(),
    lastBackup: null,
    quotesExportedAt: null,
    seenChangesVersion: null,
  };
}

export function emptyData() {
  return { version: DATA_VERSION, books: [], sessions: [], quotes: [], settings: defaultSettings(), activeSession: null, club: emptyClub() };
}

export function migrate(raw) {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const data = {
    version: DATA_VERSION,
    books: Array.isArray(raw.books) ? raw.books : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    quotes: Array.isArray(raw.quotes) ? raw.quotes : [],
    settings: Object.assign(base.settings, raw.settings || {}),
    activeSession: raw.activeSession || null,
    club: Object.assign(emptyClub(), raw.club || {}),
  };
  if (!Array.isArray(data.settings.reflectionQuestions) || !data.settings.reflectionQuestions.length) {
    data.settings.reflectionQuestions = DEFAULT_QUESTIONS.slice();
  }
  for (const b of data.books) {
    b.totalPages = Number(b.totalPages) || 0;
    b.currentPage = Number(b.currentPage) || 0;
    if (!b.status) b.status = 'want';
  }
  return data;
}

/** Prüft eine Backup-Datei; wirft einen verständlichen Fehler */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Die Datei ist kein gültiges Backup.');
  if (obj.app !== 'lesejournal') throw new Error('Diese Datei ist kein Backup des Lesejournals.');
  if (!obj.data || !Array.isArray(obj.data.books)) throw new Error('Im Backup fehlen die Bücher.');
  return {
    data: migrate(obj.data),
    photos: obj.photos && typeof obj.photos === 'object' ? obj.photos : {},
    exportedAt: obj.exportedAt || null,
  };
}

export function backupDue(settings, hasData, now = Date.now()) {
  if (!hasData) return false;
  if (!settings.lastBackup) return true;
  return now - settings.lastBackup > 30 * 86400000;
}

/* ---------- Session-Timer ---------- */

/** Vergangene Sekunden einer aktiven Session (berücksichtigt Pausen) */
export function elapsedSec(active, now = Date.now()) {
  if (!active) return 0;
  const paused = active.pausedTotal || 0;
  const end = active.pausedAt || now;
  return Math.max(0, (end - active.startedAt - paused) / 1000);
}

export function remainingSec(active, now = Date.now()) {
  if (!active || active.mode !== 'countdown') return null;
  return active.targetSec - elapsedSec(active, now);
}

/* ---------- Buchclub ---------- */

// Ohne 0/O und 1/I, damit man den Code nicht verwechselt
export const CLUB_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeClubCode(rand = Math.random) {
  let c = '';
  for (let i = 0; i < 8; i++) c += CLUB_CODE_ALPHABET[Math.floor(rand() * CLUB_CODE_ALPHABET.length) % CLUB_CODE_ALPHABET.length];
  return c;
}

/** Eingabe wie "abcd-efgh" → "ABCDEFGH" oder null */
export function normalizeClubCode(input) {
  const c = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 8) return null;
  for (const ch of c) if (!CLUB_CODE_ALPHABET.includes(ch)) return null;
  return c;
}

export function fmtClubCode(c) { return c ? `${c.slice(0, 4)}-${c.slice(4)}` : ''; }

/** Seiten pro Tag in den letzten Tagen (für ein Buch) */
export function pagesPerDay(sessions, bookId, now = Date.now(), days = 7) {
  const from = now - days * 86400000;
  let pages = 0;
  for (const s of sessions) if (s.bookId === bookId && (s.end || s.start) >= from) pages += sessionPages(s);
  return Math.round(pages / days * 10) / 10;
}

/** Was ein Mitglied mit der Gruppe teilt (nur das Clubbuch, keine Notizen) */
export function clubSnapshot(book, sessions, club, now = Date.now()) {
  const base = {
    name: String(club.name || '').trim().slice(0, 30) || 'Mitglied',
    status: String(club.status || '').slice(0, 120),
    statusAt: club.status ? (club.statusAt || null) : null,
  };
  if (!book) return { ...base, bookTitle: null, bookAuthor: null, page: 0, total: 0, progress: 0, pace: 0, finishedAt: null, rating: null, verdict: '' };
  const finished = book.status === 'finished';
  return {
    ...base,
    bookTitle: String(book.title || '').slice(0, 120),
    bookAuthor: String(book.author || '').slice(0, 80) || null,
    page: finished ? (Number(book.totalPages) || 0) : (Number(book.currentPage) || 0),
    total: Number(book.totalPages) || 0,
    progress: Math.round(bookProgress(book) * 1000) / 1000,
    pace: pagesPerDay(sessions, book.id, now),
    finishedAt: finished ? (book.finishedAt || now) : null,
    rating: finished && book.rating && book.rating.overall ? book.rating.overall : null,
    verdict: '', // Das Fazit bleibt privat – der Club sieht nur die Sterne
  };
}

/** Rennen: Fertige zuerst (wer zuerst fertig war), dann nach Fortschritt, dann nach Tempo */
export function clubRace(members) {
  const rows = members.map(m => {
    const progress = m.finishedAt ? 1 : Math.min(1, Math.max(0, Number(m.progress) || 0));
    return { ...m, progress, finished: !!m.finishedAt, noBook: !m.bookTitle, pct: Math.round(progress * 100) };
  });
  rows.sort((a, b) => {
    if (a.noBook !== b.noBook) return a.noBook ? 1 : -1;
    if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    return (b.pace || 0) - (a.pace || 0);
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Treffen: Tage bis dahin und wie weit man heute sein sollte (Soll-Linie) */
export function meetingInfo(group, now = Date.now()) {
  if (!group || !group.meetingDate) return null;
  const meet = dayKeyToDate(group.meetingDate).getTime();
  const days = Math.round((meet - startOfDay(now)) / 86400000);
  const start = Number(group.roundStart) || now;
  let target = null;
  if (meet > start) target = Math.min(1, Math.max(0, (now - start) / (meet - start)));
  return { date: meet, days, past: days < 0, target };
}

export function fmtDaysUntil(days) {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === -1) return 'gestern';
  if (days < 0) return `vor ${-days} Tagen`;
  return `in ${days} Tagen`;
}

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24 && dayKey(ts) === dayKey(now)) return `vor ${h} Std.`;
  const d = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (d === 1) return 'gestern';
  if (d < 7) return `vor ${d} Tagen`;
  return fmtDate(ts, { year: false });
}

/** Herzen für den aktuellen Status eines Mitglieds */
export function heartsFor(hearts, toUid, statusAt, myUid) {
  const list = hearts.filter(h => h.to === toUid && h.statusAt === statusAt);
  return { count: list.length, mine: list.some(h => h.from === myUid) };
}

export function emptyClub() {
  return { code: null, name: '', bookId: null, status: '', statusAt: null, verdict: '' };
}

/* ---------- Countdown-Dauer ---------- */

export const COUNTDOWN_PRESETS = [15, 20, 30, 45, 60, 90];

/** Stunden + Minuten aus Eingabefeldern → Minuten (1 bis 12 Stunden) oder null */
export function countdownMinutes(hours, minutes) {
  const h = parseNum(String(hours ?? '').trim() || '0');
  const m = parseNum(String(minutes ?? '').trim() || '0');
  if (isNaN(h) || isNaN(m) || h < 0 || m < 0) return null;
  const total = Math.round(h * 60 + m);
  return total >= 1 && total <= 720 ? total : null;
}

export function splitMinutes(total) { return { h: Math.floor(total / 60), m: total % 60 }; }

export function fmtMinutes(total) {
  const { h, m } = splitMinutes(total);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ---------- Was ist neu ---------- */

export const CHANGELOG = [
  { version: '1.2.0', items: [
    'Countdown beliebig lang: Unter „Eigene“ Stunden und Minuten eingeben.',
    'Zitate diktieren statt abfotografieren: Auf „Diktieren“ tippen und ins Mikrofon der Tastatur sprechen.',
    'Zwischen Heute, Bücher, Club und Statistik einfach nach links oder rechts wischen.',
    'Zitate im Club teilen und die Zitate der anderen in die eigene Liste übernehmen.',
    'Im Club sehen die anderen nur noch deine Sterne. Dein Fazit bleibt privat.',
  ] },
  { version: '1.1.0', items: [
    'Neuer Tab „Club“: Lest gemeinsam mit eurem Buchclub, mit Lese-Wettrennen, Treffen-Countdown und Status.',
    'Die App reicht jetzt bis ganz nach oben.',
    'Die Einstellungen („Mehr“) findest du über das Zahnrad oben rechts.',
  ] },
];

/** "1.10.0" > "1.9.2" */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

/** Neuerungen, die noch nicht als gelesen markiert sind (neueste zuerst) */
export function pendingChanges(seenVersion, current = APP_VERSION, log = CHANGELOG) {
  return log.filter(e => compareVersions(e.version, seenVersion || '1.0.0') > 0 && compareVersions(e.version, current) <= 0);
}
