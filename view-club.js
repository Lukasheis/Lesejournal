// view-club.js – Community-Tab: mehrere Buchclubs, Club-Regal, Rennen je Buch, Bewertungen, Zitate, Treffen
import * as store from './store.js';
import * as club from './club.js';
import { fmtNum, fmtDate, clubRace, clubShelf, ratingSummary, memberBooks, meetingInfo, fmtDaysUntil, timeAgo, heartsFor,
  normalizeClubCode, fmtClubCode, dayKey, quoteSource, slugify, fmtSpan, keepTime, WEEKDAYS, MONTHS } from './core.js';
import { icon } from './icons.js';
import { esc, A, openSheet, closeSheet, sheetHead, toast, confirmDialog, starsView, starsInput, coverHtml, moreBtn, toggle, segmented } from './ui.js';
import { VIEWS, nav, render } from './nav.js';
import { quoteSheet } from './sheets.js';
import { startSessionSheet } from './session.js';

let animatedKey = null;        // Balken nur beim ersten Anzeigen eines Buchs wachsen lassen
const selected = {};           // Club-Code → gewähltes aktuelles Buch
let showAllQuotes = false;

const head = (title, eyebrow, extra = '') => `
  <header class="page-head">
    <div><p class="eyebrow">${eyebrow}</p><h1 class="${title.length > 16 ? 'long' : ''}">${title}</h1></div>
    <div class="head-btns">${extra}${moreBtn()}</div>
  </header>`;

const initial = name => esc((String(name || '?').trim()[0] || '?').toUpperCase());
const hue = uid => { let h = 0; for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ['f1', 'f2', 'f3'][h % 3]; };
const longDate = ts => { const d = new Date(ts); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const pageTxt = n => fmtNum(Number(n) || 0);
const paceTxt = p => `${fmtNum(p, p % 1 ? 1 : 0)} S./Tag`;
const same = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();
const fakeBook = b => ({ title: b.title, author: b.author });
const today = () => dayKey(Date.now());

/** Mein Exemplar eines Clubbuchs (verknüpft oder per Titel gefunden) */
function myCopy(entry, slug, title) {
  const id = entry && entry.links && entry.links[slug];
  const linked = id ? store.book(id) : null;
  if (linked) return { book: linked, linked: true };
  const match = store.get().books.find(b => slugify(b.title) === slug || same(b.title, title));
  return { book: match || null, linked: false };
}

/** Meine Sterne für ein Clubbuch */
function myRating(entry, slug) {
  const { book, linked } = myCopy(entry, slug);
  if (linked && book && book.status === 'finished' && book.rating && book.rating.overall) return book.rating.overall;
  return (entry && entry.ratings && entry.ratings[slug]) || 0;
}

VIEWS.club = {
  render() {
    const list = club.clubs();
    if (!list.length) return club.isConfigured() ? joinView() : setupView();
    const L = club.live;
    const code = club.activeCode();
    const g = L.code === code ? L.group : null;
    if (!g) {
      const msg = L.status === 'error' ? L.error : L.status === 'live' ? 'Diese Gruppe gibt es nicht mehr.' : 'Verbinde mit dem Buchclub …';
      return `${head('Club', 'Buchclub')}
        ${switcher(list, code)}
        <div class="empty">${L.status === 'error' || L.status === 'live' ? icon('info') : '<span class="spinner big"></span>'}<p>${esc(msg || '')}</p>
        ${L.status === 'live' || L.status === 'error' ? `<button class="btn tonal" data-act="clubLeave">Gruppe verlassen</button>` : ''}</div>`;
    }
    return groupView(club.info(code), L, g, list);
  },
};

/* ---------- Noch nicht eingerichtet ---------- */

function setupView() {
  return `${head('Club', 'Gemeinsam lesen')}
  <section class="card hero-empty">
    <div class="hero-art">${icon('club')}</div>
    <h2>Dein Buchclub</h2>
    <p>Erstelle eine Gruppe für deinen Buchclub. Ihr seht live, wer welches Buch liest und wie weit alle sind – als Wettrennen.</p>
    <button class="btn primary big" data-act="clubDemo">${icon('play')}Vorschau ansehen</button>
  </section>
  <section class="card group">
    <p class="g-note">Für den Club braucht die App eine kleine Gratis-Datenbank bei Google Firebase. Die Einrichtung machst du einmal, sie dauert etwa 15 Minuten. Die Schritte stehen in der ANLEITUNG im Abschnitt „Buchclub“.</p>
    <button class="g-row link-row" data-act="clubHelp"><span class="g-lbl">${icon('info')}Was wird geteilt?</span>${icon('chevronRight')}</button>
  </section>`;
}

function joinView() {
  return `${head('Club', 'Gemeinsam lesen')}
  <section class="card hero-empty">
    <div class="hero-art">${icon('club')}</div>
    <h2>Lest gemeinsam</h2>
    <p>Erstelle eine Gruppe und schick den Code an deine Mitglieder. Oder tritt mit einem Code bei.</p>
    <button class="btn primary big" data-act="clubJoin">${icon('club')}Mit Code beitreten</button>
    <button class="btn tonal big" data-act="clubCreate">${icon('plus')}Neue Gruppe erstellen</button>
  </section>
  <section class="card group">
    <button class="g-row link-row" data-act="clubHelp"><span class="g-lbl">${icon('info')}Was wird geteilt?</span>${icon('chevronRight')}</button>
  </section>`;
}

/* ---------- Club-Auswahl ---------- */

function switcher(list, code) {
  if (club.isDemo()) return '';
  return `<div class="club-switch hscroll" data-noswipe>
    ${list.map(c => `<button class="chip ${c.code === code ? 'on' : ''}" data-act="clubSwitch" data-code="${esc(c.code)}">${icon('club')}${esc(c.groupName || fmtClubCode(c.code))}</button>`).join('')}
    <button class="chip add" data-act="clubAddClub">${icon('plus')}Club</button>
  </div>`;
}

/* ---------- In einer Gruppe ---------- */

function groupView(i, L, g, list) {
  const now = Date.now();
  const shelf = clubShelf(L.books, L.members);
  const cur = shelf.current;
  // Gewähltes Buch merken; fehlt es (noch), vorübergehend das erste zeigen, ohne die Wahl zu vergessen
  let slug = selected[L.code];
  if (!cur.some(b => b.slug === slug)) slug = cur[0] ? cur[0].slug : null;
  const book = cur.find(b => b.slug === slug) || null;
  const meet = meetingInfo(g, now);
  const target = meet && !meet.past && meet.target >= 0.01 ? meet.target : null;
  const admin = club.isAdmin();

  return `
  ${head(esc(g.name || 'Buchclub'), `Buchclub · ${L.members.length} ${L.members.length === 1 ? 'Mitglied' : 'Mitglieder'}`,
    `<button class="round" data-act="clubInvite" aria-label="Einladen">${icon('share')}</button>`)}
  ${switcher(list, L.code)}

  ${club.isDemo() ? `<div class="banner demo">${icon('sparkle')}<span><strong>Vorschau mit Beispieldaten</strong><small>Nichts davon ist echt oder wird gesendet.</small></span><button class="link" data-act="clubDemoEnd">Beenden</button></div>` : ''}

  ${meet ? `
  <section class="meet-card ${meet.past ? 'past' : ''}">
    <div class="meet-blobs"><i></i><i></i></div>
    <div class="meet-top"><span>${icon('calendar')}${meet.past ? 'Letztes Treffen' : 'Nächstes Treffen'}</span>
      <button class="round sm glass" data-act="clubMeeting" aria-label="Treffen bearbeiten">${icon('edit')}</button></div>
    <strong class="meet-days">${esc(fmtDaysUntil(meet.days).replace(/^./, c => c.toUpperCase()))}</strong>
    <p>${esc(longDate(meet.date))}${g.meetingNote ? ` · ${esc(g.meetingNote)}` : ''}</p>
    ${meet.past ? '<p class="meet-hint">Tippe auf den Stift für das nächste Datum.</p>' : ''}
  </section>` : `
  <button class="banner tonal-banner" data-act="clubMeeting">${icon('calendar')}<span><strong>Treffen-Datum festlegen</strong><small>Mit Countdown und Soll-Linie im Rennen</small></span>${icon('chevronRight')}</button>`}

  <div class="section-head"><h2 class="group-title">Wir lesen gerade</h2>
    <button class="link small" data-act="clubBookAdd">${icon('plus')}Buch</button></div>
  ${cur.length ? `
    ${cur.length > 1 ? `<div class="book-tabs hscroll" data-noswipe>${cur.map(b => `<button class="chip ${b.slug === slug ? 'on' : ''}" data-act="clubSel" data-slug="${esc(b.slug)}">${esc(b.title)}</button>`).join('')}</div>` : ''}
    ${bookCard(i, L, book)}
    ${raceCard(L, book, target, now)}` : `
    <section class="card hero-empty small">
      <h2>Was lest ihr gerade?</h2>
      <p>Lege euer Clubbuch an. Es kann auch mehrere gleichzeitig geben, jedes mit eigenem Rennen.</p>
      <button class="btn primary" data-act="clubBookAdd">${icon('plus')}Clubbuch hinzufügen</button>
    </section>`}

  ${quotesSection(L, now)}

  <div class="section-head"><h2 class="group-title">Unser Regal</h2>
    <button class="link small" data-act="clubBookPast">${icon('plus')}Nachtragen</button></div>
  ${shelf.done.length ? `<section class="card shelf">${shelf.done.map(b => shelfItem(i, L, b)).join('')}</section>` : `
  <button class="banner tonal-banner" data-act="clubBookPast">${icon('books')}<span><strong>Gelesenes Buch nachtragen</strong><small>Mit Zeitraum und euren Sternen</small></span>${icon('chevronRight')}</button>`}

  <h2 class="group-title">Gruppe</h2>
  <section class="card group">
    <button class="g-row link-row" data-act="clubInvite"><span class="g-lbl">${icon('share')}Mitglieder einladen</span><span class="g-val code">${fmtClubCode(L.code)}</span></button>
    <button class="g-row link-row" data-act="clubName"><span class="g-lbl">${icon('pen')}Mein Name</span><span class="g-val">${esc((i && i.name) || '')}${icon('chevronRight')}</span></button>
    <button class="g-row link-row" data-act="clubStatus"><span class="g-lbl">${icon('heart')}Mein Status</span><span class="g-val">${i && i.status ? 'ändern' : 'schreiben'}${icon('chevronRight')}</span></button>
    ${admin ? `
    <button class="g-row link-row" data-act="clubRename"><span class="g-lbl">${icon('edit')}Gruppenname ändern</span>${icon('chevronRight')}</button>
    <button class="g-row link-row" data-act="clubMembers"><span class="g-lbl">${icon('club')}Mitglieder verwalten</span>${icon('chevronRight')}</button>` : ''}
    <button class="g-row link-row" data-act="clubHelp"><span class="g-lbl">${icon('shield')}Was wird geteilt?</span>${icon('chevronRight')}</button>
    <button class="g-row link-row danger" data-act="clubLeave"><span class="g-lbl">${icon('close')}Gruppe verlassen</span></button>
  </section>`;
}

/** Karte des gewählten aktuellen Buchs mit meinem Stand */
function bookCard(i, L, b) {
  const { book: mine, linked } = myCopy(i, b.slug, b.title);
  const readers = L.members.filter(m => memberBooks(m)[b.slug]).length;
  const finished = linked && mine.status === 'finished';
  const span = fmtSpan(b.start, b.end);
  return `<section class="card cbook">
    <div class="my-row">${coverHtml(linked ? mine : fakeBook(b), 's')}
      <div><strong>${esc(b.title)}</strong>
        <small>${esc(b.author || '')}</small>
        <small class="muted">${[span, `${readers} ${readers === 1 ? 'liest' : 'lesen'} mit`].filter(Boolean).map(esc).join(' · ')}</small></div>
      <button class="round sm" data-act="clubBookEdit" data-slug="${esc(b.slug)}" aria-label="Clubbuch bearbeiten">${icon('edit')}</button>
    </div>
    ${linked ? `
      <p class="my-line">${icon('book')}${finished ? `Du hast es am ${esc(fmtDate(mine.finishedAt))} beendet` : `Du bist auf Seite ${pageTxt(mine.currentPage)} von ${pageTxt(mine.totalPages)}`}</p>
      ${i && i.status ? `<p class="my-status">„${esc(i.status)}“</p>` : ''}
      <div class="my-actions">
        ${finished
          ? `<button class="btn primary" data-act="clubQuoteAdd">${icon('quote')}Zitat teilen</button>`
          : `<button class="btn primary" data-act="clubRead" data-id="${mine.id}">${icon('timer')}Weiterlesen</button>`}
        <button class="btn tonal" data-act="clubStatus">${icon('pen')}Status</button>
      </div>
      <button class="link small muted" data-act="clubPickFor" data-slug="${esc(b.slug)}">Anderes Exemplar verknüpfen</button>` : `
      <p class="hint">Liest du mit? Dann erscheint dein Fortschritt im Rennen.</p>
      <div class="my-actions">
        <button class="btn primary" data-act="clubJoinBook" data-slug="${esc(b.slug)}">${icon('check')}${mine ? 'Ja, lese ich' : 'Lese ich auch'}</button>
        <button class="btn tonal" data-act="clubPickFor" data-slug="${esc(b.slug)}">${icon('books')}Exemplar wählen</button>
      </div>`}
  </section>`;
}

function raceCard(L, b, target, now) {
  const rows = clubRace(L.members, b.slug);
  const key = `${L.code}/${b.slug}`;
  const grow = animatedKey !== key;
  animatedKey = key;
  const missing = L.members.filter(m => !memberBooks(m)[b.slug]).map(m => m.uid === L.uid ? 'du' : m.name);
  const statusLine = L.status === 'live' ? `<span class="live-dot"></span>Live · ${timeAgo(L.updatedAt, now)}`
    : L.status === 'error' ? `${icon('info')}${esc(L.error || 'Offline')}`
    : `<span class="spinner"></span>Verbinde …`;
  return `<section class="card race ${grow ? 'grow' : ''}">
    <div class="card-head"><h3>${icon('flag')}Das Rennen</h3><small class="sync">${statusLine}</small></div>
    ${target != null ? `<p class="race-legend"><i></i><span>Soll heute: <b>${Math.round(target * 100)} %</b> – so seid ihr bis zum Treffen fertig</span></p>` : ''}
    <div class="race-list">
      ${rows.map(r => raceRow(r, L, target, now)).join('') || '<p class="hint">Noch liest niemand mit. Tippe oben auf „Lese ich auch“.</p>'}
    </div>
    ${missing.length && rows.length ? `<p class="race-missing">Noch nicht dabei: ${esc(missing.join(', '))}</p>` : ''}
  </section>`;
}

function raceRow(r, L, target, now) {
  const me = r.uid === L.uid;
  const p = r.progress;
  const hearts = r.statusAt ? heartsFor(L.hearts, r.uid, r.statusAt, L.uid) : null;
  const behind = target != null && !r.finished && p + 0.02 < target;
  const sub = r.finished ? `Fertig am ${fmtDate(r.finishedAt, { year: false })}`
    : [`S. ${pageTxt(r.page)} von ${pageTxt(r.total)}`, r.pace ? paceTxt(r.pace) : null, r.updatedAt ? timeAgo(r.updatedAt, now) : null].filter(Boolean).join(' · ');
  return `<div class="race-row ${me ? 'me' : ''} ${r.finished ? 'done' : ''}" style="--p:${p};--av:var(--${hue(r.uid)})">
    <div class="race-top">
      <span class="race-rank">${r.rank}</span>
      <strong>${esc(r.name)}${me && String(r.name).toLowerCase() !== 'du' ? ' <small>(du)</small>' : ''}</strong>
      ${r.finished && r.rating ? starsView(r.rating, 'xs') : ''}
      <span class="race-pct">${r.pct} %</span>
    </div>
    <div class="race-track">
      <span class="race-fill"></span>
      ${target != null ? `<span class="race-target" style="--t:${target}"></span>` : ''}
      <span class="race-runner">${r.finished ? icon('trophy') : initial(r.name)}</span>
    </div>
    <p class="race-sub">${esc(sub)}${behind ? ' <span class="badge warn">hinter Soll</span>' : ''}</p>
    ${r.status ? `<div class="race-status"><p>„${esc(r.status)}“ <small>${esc(timeAgo(r.statusAt, now))}</small></p>
      <button class="heart ${hearts && hearts.mine ? 'on' : ''}" ${me ? 'disabled' : `data-act="clubHeart" data-to="${esc(r.uid)}" data-at="${r.statusAt}"`} aria-label="Herz">${icon('heart')}<span>${hearts && hearts.count ? hearts.count : ''}</span></button></div>` : ''}
  </div>`;
}

/** Eintrag im Regal: gelesenes Buch mit Club-Durchschnitt */
function shelfItem(i, L, b) {
  const sum = ratingSummary(L.members, b.slug);
  const mine = myRating(i, b.slug);
  return `<button class="shelf-item" data-act="clubBookDetail" data-slug="${esc(b.slug)}">
    ${coverHtml(fakeBook(b), 'xs')}
    <span class="si-txt"><strong>${esc(b.title)}</strong><small>${esc([b.author, fmtSpan(b.start, b.end)].filter(Boolean).join(' · '))}</small>
      ${mine ? '' : '<small class="si-ask">Noch nicht von dir bewertet</small>'}</span>
    <span class="si-avg">${sum.avg ? `<b>${fmtNum(sum.avg, 1)}</b>${icon('star')}<small>${sum.count}</small>` : '<small>–</small>'}</span>
  </button>`;
}

/* ---------- Zitate im Club ---------- */

const clubQuoteSource = q => [q.bookAuthor, q.bookTitle].filter(Boolean).join(', ') + (q.chapter ? ` · Kap. ${q.chapter}` : '') + (q.page ? ` · S. ${q.page}` : '');

function quotesSection(L, now) {
  const list = (L.quotes || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const mine = store.get().quotes;
  const shown = showAllQuotes ? list : list.slice(0, 4);
  return `
  <div class="section-head"><h2 class="group-title">Zitate aus dem Club</h2>
    <button class="link small" data-act="clubQuoteAdd">${icon('plus')}Teilen</button></div>
  ${list.length ? `
  <section class="club-quotes">${shown.map(q => {
    const own = q.from === L.uid;
    const have = !own && mine.some(m => same(m.text, q.text));
    return `<article class="card club-quote">
      <p class="cq-text">„${esc(q.text)}“</p>
      <p class="cq-src">${esc(clubQuoteSource(q))}</p>
      <div class="cq-foot">
        <span class="avatar xs" style="--av:var(--${hue(q.from)})">${initial(q.name)}</span>
        <small>${esc(own ? 'Du' : q.name)} · ${esc(timeAgo(q.createdAt, now))}</small>
        ${own || club.isAdmin()
          ? `<button class="link small muted" data-act="clubQuoteDel" data-id="${esc(q.id)}" aria-label="Zitat aus dem Club entfernen">${icon('trash')}</button>` : ''}
        ${own ? '' : have
          ? `<span class="cq-have">${icon('check')}In deiner Liste</span>`
          : `<button class="btn tonal sm" data-act="clubQuoteTake" data-id="${esc(q.id)}">${icon('plus')}Übernehmen</button>`}
      </div>
    </article>`;
  }).join('')}
  ${list.length > 4 ? `<button class="btn ghost" data-act="clubQuotesMore">${showAllQuotes ? 'Weniger anzeigen' : `Alle ${list.length} Zitate anzeigen`}</button>` : ''}
  </section>` : `
  <button class="banner tonal-banner" data-act="clubQuoteAdd">${icon('quote')}<span><strong>Erstes Zitat teilen</strong><small>Die anderen können es in ihre Liste übernehmen</small></span>${icon('chevronRight')}</button>`}`;
}

/* ---------- Live neu zeichnen ---------- */

club.onLive(L => {
  // Gruppennamen für die Club-Auswahl merken
  if (!club.isDemo() && L.group && L.code) {
    const e = club.info(L.code);
    if (e && e.groupName !== L.group.name) { club.setInfo({ groupName: L.group.name }, L.code); return; }
  }
  if (nav.current.name === 'club') render();
});

/* ---------- Hilfen ---------- */

const busy = async (btn, fn) => {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try { return await fn(); }
  catch (err) { toast(err.message || 'Hat nicht geklappt', { icon: 'info' }); return null; }
  finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
};

function textSheet({ title, label, value = '', placeholder = '', max = 60, multiline = false, chips = [], hint = '', save, clear = null }) {
  openSheet(`
    ${sheetHead(title, { action: 'tsSave', actionLabel: 'Sichern' })}
    <div class="form">
      <label class="lbl" for="ts-in">${esc(label)}</label>
      ${multiline
        ? `<textarea id="ts-in" class="input" maxlength="${max}" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input id="ts-in" class="input" maxlength="${max}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">`}
      <div class="lbl-row"><span class="hint">${esc(hint)}</span><span class="hint" id="ts-count"></span></div>
      ${chips.length ? `<div class="chips">${chips.map(c => `<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${clear ? `<button class="btn ghost danger" data-clear>${esc(clear)}</button>` : ''}
    </div>`, {
    onMount(root, entry) {
      const inp = root.querySelector('#ts-in');
      const cnt = root.querySelector('#ts-count');
      const upd = () => { cnt.textContent = `${inp.value.length}/${max}`; };
      upd(); inp.addEventListener('input', upd);
      root.addEventListener('click', async e => {
        const chip = e.target.closest('[data-chip]');
        if (chip) { inp.value = chip.dataset.chip; upd(); return; }
        if (e.target.closest('[data-clear]')) { await save(''); closeSheet(entry); return; }
        const b = e.target.closest('[data-act="tsSave"]');
        if (!b) return;
        e.stopPropagation();
        const v = inp.value.trim();
        const ok = await busy(b, () => save(v).then(() => true));
        if (ok) closeSheet(entry);
      });
      setTimeout(() => inp.focus(), 350);
    },
  });
}

/** Liste eigener Bücher zum Antippen */
function bookPicker(title, hint, onPick, { filter = () => true } = {}) {
  const order = { reading: 0, want: 1, finished: 2, abandoned: 3 };
  const list = store.get().books.filter(filter).sort((a, b) => (order[a.status] - order[b.status]) || ((b.addedAt || 0) - (a.addedAt || 0)));
  openSheet(`<h2 class="sheet-title">${esc(title)}</h2>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    <div class="pick-list">
      ${list.map(b => `<button class="pick-book" data-pick="${b.id}">${coverHtml(b, 's')}
        <span><strong>${esc(b.title)}</strong><small>${esc(b.author || '')}${b.status === 'finished' ? ' · gelesen' : b.status === 'want' ? ' · Wunschliste' : ''}</small></span></button>`).join('') || '<p class="hint">Noch keine Bücher.</p>'}
    </div>`, {
    tall: list.length > 5,
    onMount(root, entry) {
      root.addEventListener('click', e => {
        const p = e.target.closest('[data-pick]');
        if (p) { closeSheet(entry); onPick(store.book(p.dataset.pick)); }
      });
    },
  });
}

/** Datumsfeld → Zeitpunkt oder null */
const tsOf = key => key ? keepTime(key) : null;

/* ---------- Aktionen ---------- */

Object.assign(A, {
  openMore: () => nav.push('more'),
  clubDemo: () => { club.startDemo(); render({ top: true, anim: 'fade' }); },
  clubDemoEnd: () => { club.stopDemo(); animatedKey = null; render({ top: true, anim: 'fade' }); },

  clubHelp() {
    openSheet(`<h2 class="sheet-title">Was wird geteilt?</h2>
      <div class="help">
        <p><strong>Mit deiner Gruppe teilst du nur:</strong></p>
        <ul><li>deinen Namen (den du selbst wählst)</li>
          <li>die Bücher, die du mit dem Club verknüpfst: Titel, Seite, Tempo, Beginn und Ende</li>
          <li>deinen Status-Satz, falls du einen schreibst</li>
          <li>deine Sterne für Clubbücher (nicht dein Fazit)</li>
          <li>Zitate, die du selbst im Club teilst</li></ul>
        <p><strong>Am iPhone bleiben:</strong> alle anderen Bücher, deine übrigen Zitate, Notizen, Fazits, Fotos, Reflexionsfragen und Statistiken.</p>
        <p>Die Club-Daten liegen in einer Gratis-Datenbank von Google Firebase (Server in Frankfurt). Mitglieder brauchen kein Konto: Die App meldet sich anonym an. Nur wer den Gruppen-Code kennt, sieht die Gruppe.</p>
        <p>Du kannst in mehreren Clubs sein. Wenn du eine Gruppe verlässt, wird dein Eintrag dort gelöscht.</p>
      </div>`);
  },

  /* ----- Clubs ----- */

  clubSwitch(el) {
    if (el.classList.contains('on')) return;
    club.switchTo(el.dataset.code).catch(err => toast(err.message, { icon: 'info' }));
    render({ top: true, anim: 'fade' });
  },

  clubAddClub() {
    openSheet(`<h2 class="sheet-title">Weiterer Club</h2>
      <div class="plus-grid two">
        <button class="plus-item" data-c="join"><span class="plus-ic">${icon('club')}</span><strong>Beitreten</strong><small>Mit Code</small></button>
        <button class="plus-item" data-c="create"><span class="plus-ic">${icon('plus')}</span><strong>Neu erstellen</strong><small>Du bist Admin</small></button>
      </div>`, {
      onMount(root, entry) {
        root.addEventListener('click', e => {
          const b = e.target.closest('[data-c]');
          if (!b) return;
          closeSheet(entry);
          setTimeout(() => (b.dataset.c === 'join' ? A.clubJoin() : A.clubCreate()), 250);
        });
      },
    });
  },

  clubCreate() {
    const lastName = (club.clubs()[0] || {}).name || '';
    openSheet(`${sheetHead('Neue Gruppe', { action: 'ccSave', actionLabel: 'Erstellen' })}
      <div class="form">
        <label class="lbl" for="cc-group">Name der Gruppe</label>
        <input id="cc-group" class="input" maxlength="40" placeholder="z. B. Buchclub Donnerstag" autocomplete="off">
        <label class="lbl" for="cc-name">Dein Name</label>
        <input id="cc-name" class="input" maxlength="30" value="${esc(lastName)}" placeholder="So sehen dich die anderen" autocomplete="given-name">
        <p class="hint">Danach bekommst du einen Code, den du deinen Mitgliedern schickst.</p>
      </div>`, {
      onMount(root, entry) {
        root.querySelector('[data-act="ccSave"]').addEventListener('click', async e => {
          e.stopPropagation();
          const groupName = root.querySelector('#cc-group').value.trim();
          const name = root.querySelector('#cc-name').value.trim();
          if (!groupName || !name) { toast('Bitte beide Namen eintragen', { icon: 'info' }); return; }
          const code = await busy(e.currentTarget, () => club.createGroup({ groupName, name }));
          if (code) { closeSheet(entry); animatedKey = null; nav.tab('club'); render({ top: true }); setTimeout(() => A.clubInvite(), 500); }
        });
      },
    });
  },

  clubJoin() {
    const lastName = (club.clubs()[0] || {}).name || '';
    openSheet(`${sheetHead('Gruppe beitreten', { action: 'cjSave', actionLabel: 'Beitreten' })}
      <div class="form">
        <label class="lbl" for="cj-code">Gruppen-Code</label>
        <input id="cj-code" class="input code-input" maxlength="9" placeholder="ABCD-EFGH" autocapitalize="characters" autocomplete="off" spellcheck="false">
        <label class="lbl" for="cj-name">Dein Name</label>
        <input id="cj-name" class="input" maxlength="30" value="${esc(lastName)}" placeholder="So sehen dich die anderen" autocomplete="given-name">
      </div>`, {
      onMount(root, entry) {
        root.querySelector('[data-act="cjSave"]').addEventListener('click', async e => {
          e.stopPropagation();
          const code = normalizeClubCode(root.querySelector('#cj-code').value);
          const name = root.querySelector('#cj-name').value.trim();
          if (!code) { toast('Der Code hat 8 Zeichen, z. B. ABCD-EFGH', { icon: 'info' }); return; }
          if (!name) { toast('Bitte deinen Namen eintragen', { icon: 'info' }); return; }
          if (club.clubs().some(c => c.code === code)) {
            closeSheet(entry); await club.switchTo(code).catch(() => {}); render({ top: true });
            toast('In diesem Club bist du schon', { icon: 'info' }); return;
          }
          const g = await busy(e.currentTarget, () => club.joinGroup({ code, name }));
          if (g) { closeSheet(entry); animatedKey = null; toast(`Willkommen bei „${g.name}“`); render({ top: true, anim: 'fade' }); }
        });
      },
    });
  },

  async clubInvite() {
    const g = club.live.group;
    const code = club.live.code;
    const url = location.origin + location.pathname;
    const text = `Komm in unseren Buchclub „${g ? g.name : ''}“ im Lesejournal!\n\n1. Diese Seite in Safari öffnen: ${url}\n2. Teilen → „Zum Home-Bildschirm“\n3. In der App: Club → „Mit Code beitreten“ (oder „+ Club“)\n\nCode: ${fmtClubCode(code)}`;
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) { /* abgebrochen */ } return; }
    try { await navigator.clipboard.writeText(text); toast('Einladung kopiert'); } catch (e) { toast(`Code: ${fmtClubCode(code)}`, { icon: 'info' }); }
  },

  clubName() {
    textSheet({ title: 'Mein Name', label: 'So sehen dich die anderen in diesem Club', value: (club.info() || {}).name, max: 30,
      save: async v => { if (!v) throw new Error('Bitte einen Namen eintragen'); club.setInfo({ name: v }); } });
  },

  clubRename() {
    textSheet({ title: 'Gruppenname', label: 'Name der Gruppe', value: club.live.group?.name || '', max: 40,
      save: async v => { if (!v) throw new Error('Bitte einen Namen eintragen'); await club.renameGroup(v); } });
  },

  clubStatus() {
    const i = club.info() || {};
    textSheet({ title: 'Status', label: 'Wie läuft es mit dem Lesen?', value: i.status, max: 120, multiline: true,
      placeholder: 'z. B. Kapitel 12 war heftig!', hint: 'Die anderen können mit einem Herz reagieren.',
      chips: ['Kann es nicht weglegen!', 'Komme gut voran', 'Hänge etwas hinterher', 'Zieht sich gerade …'],
      clear: i.status ? 'Status löschen' : null,
      save: async v => { club.setInfo({ status: v, statusAt: v ? Date.now() : null }); } });
  },

  async clubLeave() {
    const g = club.live.group;
    const ok = club.isDemo() || await confirmDialog({ title: `„${g ? g.name : 'Gruppe'}“ verlassen?`, text: 'Dein Eintrag wird aus dieser Gruppe gelöscht. Mit dem Code kannst du jederzeit wieder beitreten.', ok: 'Verlassen', danger: true });
    if (!ok) return;
    await club.leaveGroup();
    animatedKey = null;
    render({ top: true, anim: 'fade' });
  },

  clubMembers() {
    const L = club.live;
    openSheet(`<h2 class="sheet-title">Mitglieder</h2>
      <p class="hint">Entferne Einträge, die nicht mehr gebraucht werden, z. B. wenn jemand die App neu installiert hat.</p>
      <div class="member-list">${L.members.map(m => `
        <div class="member-row"><span class="avatar" style="--av:var(--${hue(m.uid)})">${initial(m.name)}</span>
          <span><strong>${esc(m.name)}${m.uid === L.uid ? ' <small>(du)</small>' : ''}</strong><small>zuletzt ${esc(timeAgo(m.updatedAt))}</small></span>
          ${m.uid === L.uid ? '' : `<button class="link danger" data-rm="${esc(m.uid)}" data-name="${esc(m.name)}">Entfernen</button>`}</div>`).join('')}
      </div>`, {
      onMount(root, entry) {
        root.addEventListener('click', async e => {
          const b = e.target.closest('[data-rm]');
          if (!b) return;
          const ok = await confirmDialog({ title: `${b.dataset.name} entfernen?`, text: 'Der Eintrag verschwindet aus dem Rennen. Die Person kann mit dem Code wieder beitreten.', ok: 'Entfernen', danger: true });
          if (!ok) return;
          await busy(null, () => club.removeMember(b.dataset.rm));
          closeSheet(entry);
        });
      },
    });
  },

  clubMeeting() {
    const g = club.live.group || {};
    const t = today();
    openSheet(`${sheetHead('Treffen', { action: 'cmSave', actionLabel: 'Sichern' })}
      <div class="form">
        <label class="lbl" for="cm-date">Datum</label>
        <input id="cm-date" class="input" type="date" min="${t}" value="${esc(g.meetingDate && g.meetingDate >= t ? g.meetingDate : '')}">
        <label class="lbl" for="cm-note">Ort und Uhrzeit <small>(optional)</small></label>
        <input id="cm-note" class="input" maxlength="60" value="${esc(g.meetingNote || '')}" placeholder="z. B. Donnerstag 19 Uhr bei Anna">
        <p class="hint">Ab heute zeigt eine Linie im Rennen, wo ihr sein solltet, um bis zum Treffen fertig zu sein. Alle in der Gruppe sehen das Datum.</p>
        ${g.meetingDate ? '<button class="btn ghost danger" data-clear>Datum entfernen</button>' : ''}
      </div>`, {
      onMount(root, entry) {
        root.addEventListener('click', async e => {
          if (e.target.closest('[data-clear]')) { await busy(null, () => club.setMeeting({ date: null, note: '' })); closeSheet(entry); return; }
          const b = e.target.closest('[data-act="cmSave"]');
          if (!b) return;
          e.stopPropagation();
          const date = root.querySelector('#cm-date').value;
          if (!date) { toast('Bitte ein Datum wählen', { icon: 'info' }); return; }
          const ok = await busy(b, () => club.setMeeting({ date, note: root.querySelector('#cm-note').value.trim() }).then(() => true));
          if (ok) closeSheet(entry);
        });
      },
    });
  },

  async clubHeart(el) {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    await busy(null, () => club.toggleHeart(el.dataset.to, Number(el.dataset.at), on));
  },

  /* ----- Aktuelle Bücher ----- */

  clubSel(el) { selected[club.live.code] = el.dataset.slug; render(); },

  clubRead: el => startSessionSheet(el.dataset.id),

  /** Neues Clubbuch: aus eigenen Büchern oder neu eintragen */
  clubBookAdd() {
    const hasBooks = store.get().books.length > 0;
    openSheet(`${sheetHead('Clubbuch hinzufügen', { action: 'cbSave', actionLabel: 'Hinzufügen' })}
      <div class="form">
        ${hasBooks ? `<button class="btn tonal" data-s="mine">${icon('books')}Aus meinen Büchern wählen</button>
        <p class="hint center">oder neu eintragen:</p>` : ''}
        <label class="lbl" for="cb-title">Titel</label>
        <input id="cb-title" class="input" maxlength="120" placeholder="Buchtitel" autocomplete="off">
        <label class="lbl" for="cb-author">Autor:in</label>
        <input id="cb-author" class="input" maxlength="80" placeholder="Vorname Nachname" autocomplete="off">
        <div class="row2">
          <div><label class="lbl" for="cb-pages">Seiten</label><input id="cb-pages" class="input" inputmode="numeric" placeholder="z. B. 320"></div>
          <div><label class="lbl" for="cb-start">Beginn</label><input id="cb-start" class="input" type="date" value="${today()}"></div>
        </div>
        <div class="list-row"><span>${icon('book')}Auch in meine Bücher <small>als „Lese ich“</small></span>${toggle('cbMine', true)}</div>
      </div>`, {
      onMount(root, entry) {
        let mineToo = true;
        root.addEventListener('togglechange', e => { mineToo = e.detail.on; });
        root.addEventListener('click', async e => {
          if (e.target.closest('[data-s="mine"]')) {
            closeSheet(entry);
            setTimeout(() => bookPicker('Aus meinen Büchern', 'Dieses Buch wird zum Clubbuch, und dein Fortschritt erscheint im Rennen.', b => addFromMine(b)), 250);
            return;
          }
          const btn = e.target.closest('[data-act="cbSave"]');
          if (!btn) return;
          e.stopPropagation();
          const title = root.querySelector('#cb-title').value.trim();
          if (!title) { toast('Bitte einen Titel eintragen', { icon: 'info' }); return; }
          const author = root.querySelector('#cb-author').value.trim();
          const total = Number(root.querySelector('#cb-pages').value.replace(/\D/g, '')) || 0;
          const start = root.querySelector('#cb-start').value || today();
          const res = await busy(btn, () => club.addClubBook({ title, author, total, status: 'current', start }));
          if (!res) return;
          if (mineToo) {
            let local = store.get().books.find(b => slugify(b.title) === res.slug);
            if (!local) local = store.addBook({ title, author, totalPages: total, status: 'reading', startedAt: tsOf(start) });
            club.linkBook(res.slug, local.id);
          }
          selected[club.live.code] = res.slug;
          closeSheet(entry);
          toast(res.existed ? 'Das Buch gibt es im Club schon' : `„${title}“ ist jetzt Clubbuch`);
          render();
        });
      },
    });
  },

  /** Ich lese ein Clubbuch mit: vorhandenes Exemplar nehmen oder anlegen */
  clubJoinBook(el) {
    const slug = el.dataset.slug;
    const b = clubShelf(club.live.books, club.live.members).current.find(x => x.slug === slug);
    if (!b) return;
    let { book } = myCopy(club.info(), slug, b.title);
    if (!book) {
      book = store.addBook({ title: b.title, author: b.author || '', totalPages: b.total || 0, status: 'reading' });
      toast(`„${b.title}“ ist jetzt in deinen Büchern`);
    } else {
      if (book.status === 'want') store.updateBook(book.id, { status: 'reading', startedAt: book.startedAt || Date.now() });
      toast('Du liest mit');
    }
    club.linkBook(slug, book.id);
    if (club.isDemo()) render();
  },

  clubPickFor(el) {
    const slug = el.dataset.slug;
    const entry = club.info();
    bookPicker('Mein Exemplar', 'Wähle das Buch aus deiner Bibliothek, dessen Fortschritt im Rennen erscheinen soll.', b => {
      club.linkBook(slug, b.id);
      toast(`„${b.title}“ verknüpft`);
      if (club.isDemo()) render();
    });
    void entry;
  },

  /** Clubbuch bearbeiten: Titel, Zeitraum, Status, löschen */
  clubBookEdit(el) {
    const slug = el.dataset.slug;
    const L = club.live;
    const b = clubShelf(L.books, L.members).current.concat(clubShelf(L.books, L.members).done).find(x => x.slug === slug);
    if (!b) return;
    const entry = club.info();
    const linked = entry && entry.links[slug];
    const canDelete = club.isAdmin() || b.addedBy === L.uid || b.implicit;
    let status = b.status === 'done' ? 'done' : 'current';
    openSheet(`${sheetHead('Clubbuch', { action: 'ceSave', actionLabel: 'Sichern' })}
      <div class="form">
        <label class="lbl" for="ce-title">Titel</label>
        <input id="ce-title" class="input" maxlength="120" value="${esc(b.title)}">
        <label class="lbl" for="ce-author">Autor:in</label>
        <input id="ce-author" class="input" maxlength="80" value="${esc(b.author || '')}">
        <label class="lbl">Status</label>
        ${segmented('ceStatus', [['current', 'Lesen wir gerade'], ['done', 'Gelesen']], status)}
        <div class="row2">
          <div><label class="lbl" for="ce-start">Beginn</label><input id="ce-start" class="input" type="date" value="${esc(b.start || '')}"></div>
          <div><label class="lbl" for="ce-end">Ende</label><input id="ce-end" class="input" type="date" value="${esc(b.end || '')}"></div>
        </div>
        <p class="hint">Beginn und Ende gelten für den ganzen Club. Deine eigenen Daten stellst du in deinem Buch ein.</p>
        ${linked ? `<button class="btn ghost" data-s="unlink">${icon('close')}Mein Exemplar lösen</button>` : ''}
        ${canDelete ? `<button class="btn ghost danger" data-s="delete">${icon('trash')}Aus dem Club entfernen</button>` : ''}
      </div>`, {
      onMount(root, sheet) {
        root.addEventListener('segchange', e => {
          status = e.detail.value;
          if (status === 'done' && !root.querySelector('#ce-end').value) root.querySelector('#ce-end').value = today();
        });
        root.addEventListener('click', async e => {
          const s = e.target.closest('[data-s]');
          if (s && s.dataset.s === 'unlink') { club.linkBook(slug, null); closeSheet(sheet); toast('Verknüpfung gelöst'); return; }
          if (s && s.dataset.s === 'delete') {
            const ok = await confirmDialog({ title: `„${b.title}“ entfernen?`, text: 'Das Buch verschwindet für alle aus dem Club-Regal. Eure eigenen Bücher bleiben erhalten.', ok: 'Entfernen', danger: true });
            if (ok && await busy(null, () => club.deleteClubBook(slug).then(() => true))) closeSheet(sheet);
            return;
          }
          const btn = e.target.closest('[data-act="ceSave"]');
          if (!btn) return;
          e.stopPropagation();
          const title = root.querySelector('#ce-title').value.trim();
          const start = root.querySelector('#ce-start').value || null;
          const end = root.querySelector('#ce-end').value || null;
          if (!title) { toast('Bitte einen Titel eintragen', { icon: 'info' }); return; }
          if (start && end && end < start) { toast('Das Ende liegt vor dem Beginn', { icon: 'info' }); return; }
          const ok = await busy(btn, () => club.updateClubBook(slug, { ...b, title, author: root.querySelector('#ce-author').value.trim(), status, start, end }).then(() => true));
          if (ok) { closeSheet(sheet); toast(status === 'done' && b.status !== 'done' ? 'Ins Regal gestellt' : 'Gespeichert'); }
        });
      },
    });
  },

  /* ----- Regal: gelesene Bücher ----- */

  /** Gemeinsam gelesenes Buch nachtragen und bewerten */
  clubBookPast() {
    let stars = 0, mineToo = true;
    openSheet(`${sheetHead('Gelesenes Buch nachtragen', { action: 'cpSave', actionLabel: 'Sichern' })}
      <div class="form">
        <label class="lbl" for="cp-title">Titel</label>
        <input id="cp-title" class="input" maxlength="120" placeholder="Buchtitel" autocomplete="off">
        <label class="lbl" for="cp-author">Autor:in</label>
        <input id="cp-author" class="input" maxlength="80" placeholder="Vorname Nachname" autocomplete="off">
        <div class="row2">
          <div><label class="lbl" for="cp-start">Gelesen von</label><input id="cp-start" class="input" type="date" max="${today()}"></div>
          <div><label class="lbl" for="cp-end">bis</label><input id="cp-end" class="input" type="date" max="${today()}" value="${today()}"></div>
        </div>
        <label class="lbl" for="cp-pages">Seiten <small>(optional)</small></label>
        <input id="cp-pages" class="input" inputmode="numeric" placeholder="z. B. 320">
        <label class="lbl center">Deine Bewertung</label>
        ${starsInput('cpStars', 0, true)}
        <div class="list-row"><span>${icon('book')}Auch in meine Bücher <small>als gelesen</small></span>${toggle('cpMine', true)}</div>
        <p class="hint">Die anderen sehen das Buch im Regal und können ihre eigenen Sterne vergeben.</p>
      </div>`, {
      tall: true,
      onMount(root, entry) {
        root.addEventListener('starchange', e => { stars = e.detail.value; });
        root.addEventListener('togglechange', e => { mineToo = e.detail.on; });
        root.querySelector('[data-act="cpSave"]').addEventListener('click', async e => {
          e.stopPropagation();
          const title = root.querySelector('#cp-title').value.trim();
          const author = root.querySelector('#cp-author').value.trim();
          const start = root.querySelector('#cp-start').value || null;
          const end = root.querySelector('#cp-end').value || null;
          const total = Number(root.querySelector('#cp-pages').value.replace(/\D/g, '')) || 0;
          if (!title) { toast('Bitte einen Titel eintragen', { icon: 'info' }); return; }
          if (start && end && end < start) { toast('Das Ende liegt vor dem Beginn', { icon: 'info' }); return; }
          const res = await busy(e.currentTarget, () => club.addClubBook({ title, author, total, status: 'done', start, end }));
          if (!res) return;
          if (res.existed) await busy(null, () => club.updateClubBook(res.slug, { title, author, total, status: 'done', start, end }));
          if (mineToo) {
            let local = store.get().books.find(b => slugify(b.title) === res.slug);
            if (!local) {
              local = store.addBook({ title, author, totalPages: total, currentPage: total, status: 'finished',
                startedAt: tsOf(start), finishedAt: tsOf(end) || Date.now(), rating: stars ? { overall: stars } : null });
            } else if (stars) {
              store.updateBook(local.id, { rating: { ...(local.rating || {}), overall: stars } });
            }
            club.linkBook(res.slug, local.id);
            if (stars && local.status !== 'finished') club.setClubRating(res.slug, stars);
          } else if (stars) club.setClubRating(res.slug, stars);
          closeSheet(entry);
          toast('Im Regal eingetragen', { icon: 'books' });
          render();
        });
      },
    });
  },

  /** Gelesenes Clubbuch: Sterne aller und eigene Bewertung */
  clubBookDetail(el) {
    const slug = el.dataset.slug;
    const L = club.live;
    const b = clubShelf(L.books, L.members).done.find(x => x.slug === slug);
    if (!b) return;
    const entry = club.info();
    const sum = ratingSummary(L.members, slug);
    const { book: mine, linked } = myCopy(entry, slug, b.title);
    const mineRating = myRating(entry, slug);
    openSheet(`
      <div class="cbd-head">${coverHtml(fakeBook(b), 'm')}
        <div><h2>${esc(b.title)}</h2><p>${esc(b.author || '')}</p><small>${esc(fmtSpan(b.start, b.end))}</small></div></div>
      <div class="avg-box">
        ${sum.avg ? `<strong>${fmtNum(sum.avg, 1)}</strong>${starsView(sum.avg, 'lg')}<small>Club-Durchschnitt aus ${sum.count} ${sum.count === 1 ? 'Bewertung' : 'Bewertungen'}</small>`
          : '<small>Noch keine Bewertungen</small>'}
      </div>
      ${sum.list.length ? `<div class="rating-list">${sum.list.map(r => `
        <div class="v-head"><span class="avatar xs" style="--av:var(--${hue(r.uid)})">${initial(r.name)}</span>
          <div><strong>${esc(r.name)}${r.uid === L.uid ? ' <small>(du)</small>' : ''}</strong></div>${starsView(r.rating)}</div>`).join('')}</div>` : ''}
      <label class="lbl center">Deine Bewertung</label>
      ${starsInput('myStars', mineRating, true)}
      ${!mine ? `<button class="btn tonal" data-s="addMine">${icon('plus')}In meine Bücher als gelesen</button>` : !linked ? `<button class="btn tonal" data-s="link">${icon('check')}Mit „${esc(mine.title)}“ verknüpfen</button>` : ''}
      <button class="btn ghost" data-s="edit">${icon('edit')}Buch und Zeitraum bearbeiten</button>`, {
      onMount(root, sheet) {
        root.addEventListener('starchange', e => {
          const v = e.detail.value;
          const cur = myCopy(club.info(), slug, b.title);
          if (cur.linked && cur.book.status === 'finished') store.updateBook(cur.book.id, { rating: { ...(cur.book.rating || {}), overall: v || null } });
          else club.setClubRating(slug, v);
          toast(v ? 'Bewertung gespeichert' : 'Bewertung entfernt', { icon: 'star' });
        });
        root.addEventListener('click', e => {
          const s = e.target.closest('[data-s]');
          if (!s) return;
          if (s.dataset.s === 'edit') { closeSheet(sheet); setTimeout(() => A.clubBookEdit({ dataset: { slug } }), 250); return; }
          if (s.dataset.s === 'link') { club.linkBook(slug, mine.id); closeSheet(sheet); toast('Verknüpft'); return; }
          if (s.dataset.s === 'addMine') {
            const r = myRating(club.info(), slug);
            const nb = store.addBook({ title: b.title, author: b.author || '', totalPages: b.total || 0, currentPage: b.total || 0, status: 'finished',
              startedAt: tsOf(b.start), finishedAt: tsOf(b.end) || Date.now(), rating: r ? { overall: r } : null });
            club.linkBook(slug, nb.id);
            closeSheet(sheet);
            toast(`„${b.title}“ ist jetzt in deinen Büchern`);
          }
        });
      },
    });
  },

  /* ----- Zitate im Club ----- */

  clubQuoteAdd() {
    const hasQuotes = store.get().quotes.length > 0;
    if (!store.get().books.length) { toast('Füge zuerst ein Buch hinzu', { icon: 'info' }); return; }
    openSheet(`<h2 class="sheet-title">Zitat teilen</h2>
      <div class="plus-grid two">
        <button class="plus-item" data-q="new"><span class="plus-ic">${icon('mic')}</span><strong>Neues Zitat</strong><small>Schreiben oder diktieren</small></button>
        <button class="plus-item ${hasQuotes ? '' : 'dim'}" data-q="mine"><span class="plus-ic">${icon('quote')}</span><strong>Aus meinen Zitaten</strong><small>${hasQuotes ? 'Eines oder mehrere' : 'Noch keine Zitate'}</small></button>
      </div>
      <p class="hint">Neue Zitate landen auch in deiner eigenen Liste.</p>`, {
      onMount(root, entry) {
        root.addEventListener('click', e => {
          const b = e.target.closest('[data-q]');
          if (!b) return;
          if (b.dataset.q === 'mine' && !hasQuotes) return;
          closeSheet(entry);
          setTimeout(() => {
            if (b.dataset.q === 'new') {
              const slug = selected[club.live.code];
              const bookId = slug ? (club.info() || { links: {} }).links[slug] : null;
              quoteSheet({ bookId, title: 'Zitat für den Club', onSaved: q => shareQuotes([q]) });
            } else pickOwnQuotes();
          }, 250);
        });
      },
    });
  },

  async clubQuoteDel(el) {
    const ok = await confirmDialog({ title: 'Zitat aus dem Club entfernen?', text: 'In deiner eigenen Liste bleibt es erhalten.', ok: 'Entfernen', danger: true });
    if (ok) await busy(null, () => club.deleteClubQuote(el.dataset.id));
  },

  async clubQuoteTake(el) {
    const q = (club.live.quotes || []).find(x => x.id === el.dataset.id);
    if (!q) return;
    let book = store.get().books.find(b => same(b.title, q.bookTitle));
    if (!book) {
      const ok = await confirmDialog({ title: `„${q.bookTitle || 'Unbekanntes Buch'}“ anlegen?`, text: 'Dieses Buch ist noch nicht in deiner Bibliothek. Es kommt auf deine Wunschliste, und das Zitat wird dort gespeichert.', ok: 'Anlegen' });
      if (!ok) return;
      book = store.addBook({ title: q.bookTitle || 'Unbekanntes Buch', author: q.bookAuthor || '', status: 'want' });
    }
    const page = Number(q.page);
    store.addQuote({ bookId: book.id, text: q.text, page: page > 0 ? page : null, chapter: q.chapter || '', fav: false });
    toast('Zitat in deine Liste übernommen', { icon: 'quote' });
  },

  clubQuotesMore() { showAllQuotes = !showAllQuotes; render(); },
});

/** Bestehendes eigenes Buch zum Clubbuch machen */
async function addFromMine(b) {
  const start = b.startedAt ? dayKey(b.startedAt) : today();
  const res = await busy(null, () => club.addClubBook({ title: b.title, author: b.author || '', total: b.totalPages || 0,
    status: b.status === 'finished' ? 'done' : 'current', start, end: b.status === 'finished' && b.finishedAt ? dayKey(b.finishedAt) : null }));
  if (!res) return;
  club.linkBook(res.slug, b.id);
  if (b.status === 'want') store.updateBook(b.id, { status: 'reading', startedAt: b.startedAt || Date.now() });
  selected[club.live.code] = res.slug;
  toast(res.existed ? 'Mit dem vorhandenen Clubbuch verknüpft' : `„${b.title}“ ist jetzt Clubbuch`);
  render();
}

/** Eigene Zitate im Club teilen */
async function shareQuotes(quotes) {
  if (!quotes.length) return;
  const n = await busy(null, () => club.shareQuotes(quotes));
  if (n) toast(n === 1 ? 'Zitat im Club geteilt' : `${n} Zitate im Club geteilt`, { icon: 'quote' });
}

/** Auswahl eigener Zitate: nach Buch gruppiert, mit Suche und Mehrfachauswahl */
function pickOwnQuotes() {
  const d = store.get();
  const shared = new Set((club.live.quotes || []).filter(x => x.from === club.live.uid).map(x => x.localId));
  const entry = club.info() || { links: {} };
  const clubBookIds = new Set(Object.values(entry.links || {}));
  const chosen = new Set();
  let term = '';

  // Gruppen: Clubbücher zuerst, dann nach letztem Zitat
  const groups = new Map();
  for (const q of d.quotes) {
    if (!groups.has(q.bookId)) groups.set(q.bookId, []);
    groups.get(q.bookId).push(q);
  }
  const order = [...groups.entries()].map(([id, qs]) => ({ book: store.book(id), qs: qs.sort((a, b) => (a.page || 0) - (b.page || 0)), last: Math.max(...qs.map(q => q.createdAt || 0)) }))
    .sort((a, b) => (clubBookIds.has(b.book && b.book.id) - clubBookIds.has(a.book && a.book.id)) || (b.last - a.last));

  const listHtml = () => {
    const t = term.trim().toLowerCase();
    const parts = order.map(g => {
      const bt = g.book ? `${g.book.title} ${g.book.author || ''}`.toLowerCase() : '';
      const qs = g.qs.filter(q => !t || q.text.toLowerCase().includes(t) || bt.includes(t));
      if (!qs.length) return '';
      const free = qs.filter(q => !shared.has(q.id));
      const all = free.length && free.every(q => chosen.has(q.id));
      return `<section class="pq-group">
        <div class="pq-head">${g.book ? coverHtml(g.book, 'xs') : ''}<span><strong>${esc(g.book ? g.book.title : 'Ohne Buch')}</strong><small>${qs.length} ${qs.length === 1 ? 'Zitat' : 'Zitate'}${clubBookIds.has(g.book && g.book.id) ? ' · Clubbuch' : ''}</small></span>
          ${free.length ? `<button class="link small" data-all="${esc(g.book ? g.book.id : '')}">${all ? 'Keines' : 'Alle'}</button>` : ''}</div>
        ${qs.map(q => {
          const done = shared.has(q.id);
          return `<button class="pick-quote ${done ? 'done' : ''} ${chosen.has(q.id) ? 'on' : ''}" data-qid="${q.id}" ${done ? 'disabled' : ''}>
            <span class="pq-check">${icon('check')}</span>
            <span class="pq-body"><span>„${esc(q.text)}“</span><small>${esc([q.chapter ? `Kap. ${q.chapter}` : '', q.page ? `S. ${q.page}` : ''].filter(Boolean).join(' · '))}${done ? ' · schon geteilt' : ''}</small></span>
          </button>`;
        }).join('')}
      </section>`;
    }).join('');
    return parts || '<p class="hint center">Keine Zitate gefunden.</p>';
  };

  openSheet(`<h2 class="sheet-title">Zitate teilen</h2>
    <div class="search pq-search">${icon('search')}<input id="pq-term" class="input" type="search" placeholder="Zitat, Buch oder Autor:in suchen" autocomplete="off"></div>
    <div class="pq-list">${listHtml()}</div>
    <div class="pq-bar"><button class="btn primary big" data-share disabled>${icon('share')}<span>Zitate auswählen</span></button></div>`, {
    tall: true,
    onMount(root, sheet) {
      const list = root.querySelector('.pq-list');
      const btn = root.querySelector('[data-share]');
      const update = () => {
        list.innerHTML = listHtml();
        btn.disabled = !chosen.size;
        btn.querySelector('span').textContent = chosen.size ? (chosen.size === 1 ? '1 Zitat teilen' : `${chosen.size} Zitate teilen`) : 'Zitate auswählen';
      };
      root.querySelector('#pq-term').addEventListener('input', e => { term = e.target.value; list.innerHTML = listHtml(); });
      root.addEventListener('click', async e => {
        const q = e.target.closest('[data-qid]');
        if (q && !q.disabled) { chosen.has(q.dataset.qid) ? chosen.delete(q.dataset.qid) : chosen.add(q.dataset.qid); update(); return; }
        const all = e.target.closest('[data-all]');
        if (all) {
          const g = order.find(x => (x.book ? x.book.id : '') === all.dataset.all);
          const free = g.qs.filter(x => !shared.has(x.id));
          const on = !free.every(x => chosen.has(x.id));
          free.forEach(x => (on ? chosen.add(x.id) : chosen.delete(x.id)));
          update(); return;
        }
        if (e.target.closest('[data-share]') && chosen.size) {
          const qs = d.quotes.filter(x => chosen.has(x.id));
          closeSheet(sheet);
          await shareQuotes(qs);
        }
      });
    },
  });
}
