// view-club.js – Community-Tab: mehrere Buchclubs, Club-Regal, Rennen je Buch, Bewertungen, Zitate, Treffen
import * as store from './store.js';
import * as club from './club.js';
import { fmtNum, fmtDate, clubRace, clubShelf, ratingSummary, memberBooks, meetingInfo, fmtDaysUntil, timeAgo, heartsFor,
  normalizeClubCode, fmtClubCode, dayKey, quoteSource, slugify, fmtSpan, keepTime, WEEKDAYS, MONTHS,
  CLUB_STATUS, clubToOwnStatus, ownToClubStatus, normalizeIsbn, fmtIsbn } from './core.js';
import { icon } from './icons.js';
import { esc, A, openSheet, closeSheet, closeAllSheets, sheetHead, toast, confirmDialog, starsView, starsInput, coverHtml, hydratePhotos, pickFile, moreBtn, toggle, segmented } from './ui.js';
import { scanIsbn, ocrCover } from './scan.js';
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

  ${shelfTeaser(shelf)}

  ${quotesSection(L, now)}

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
    <div class="my-row">${clubCover(b, 's', linked ? mine : null)}
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
  if (nav.current.name === 'club' || nav.current.name === 'clubShelf') render();
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
      hydratePhotos(root);
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

  clubBookAdd() { clubBookForm(null, { status: 'current' }); },
  clubBookPast() { clubBookForm(null, { status: 'done' }); },
  clubBookEdit(el) { clubBookForm(el.dataset.slug); },
  openClubShelf() { nav.push('clubShelf'); },

  /** Ich lese ein Clubbuch mit: vorhandenes Exemplar nehmen oder anlegen */
  async clubJoinBook(el) {
    const slug = el.dataset.slug;
    const b = findClubBook(slug);
    if (!b) return;
    let { book } = myCopy(club.info(), slug, b.title);
    if (!book) {
      book = store.addBook({ title: b.title, author: b.author || '', totalPages: b.total || 0, isbn: b.isbn || '', blurb: b.blurb || '',
        status: clubToOwnStatus(b.status), coverId: await localCoverFrom(b) });
      toast(`„${b.title}“ ist jetzt in deinen Büchern`);
    } else {
      if (book.status === 'want' && b.status === 'current') store.updateBook(book.id, { status: 'reading', startedAt: book.startedAt || Date.now() });
      toast(b.status === 'want' ? 'Verknüpft' : 'Du liest mit');
    }
    club.linkBook(slug, book.id);
    closeSheetsFor(slug);
    if (club.isDemo()) render();
  },

  clubPickFor(el) {
    const slug = el.dataset.slug;
    bookPicker('Mein Exemplar', 'Wähle das Buch aus deiner Bibliothek, das zu diesem Clubbuch gehört.', b => {
      club.linkBook(slug, b.id);
      toast(`„${b.title}“ verknüpft`);
      closeSheetsFor(slug);
      if (club.isDemo()) render();
    });
  },

  /** Clubbuch ansehen: Cover, Infos, Sterne aller, eigene Bewertung, Aktionen */
  clubBookDetail(el) {
    const slug = el.dataset.slug;
    const L = club.live;
    const b = findClubBook(slug);
    if (!b) return;
    const entry = club.info();
    const sum = ratingSummary(L.members, slug);
    const { book: mine, linked } = myCopy(entry, slug, b.title);
    const readers = L.members.filter(m => memberBooks(m)[slug]);
    const canRate = b.status === 'done' || (linked && mine.status === 'finished');
    openSheet(`
      <div class="cbd-head" data-detail="${esc(slug)}">
        <button class="cbd-cover" data-s="cover" aria-label="Cover ändern">${b.cover ? clubCover(b, 'm') : clubCover(b, 'm', linked ? mine : null)}
          <span class="cbd-cover-btn">${icon('camera')}${b.cover ? 'Ändern' : 'Cover'}</span></button>
        <div><span class="badge">${esc(CLUB_STATUS[b.status] || 'Lesen wir')}</span><h2>${esc(b.title)}</h2><p>${esc(b.author || '')}</p>
          <small>${esc([fmtSpan(b.start, b.end), b.total ? `${pageTxt(b.total)} Seiten` : ''].filter(Boolean).join(' · '))}</small></div></div>
      ${b.blurb ? `<p class="cbd-blurb">${esc(b.blurb)}</p>` : ''}
      ${b.status !== 'want' && readers.length ? `<p class="hint">${b.status === 'done' ? 'Gelesen von' : 'Lesen mit'}: ${esc(readers.map(m => m.uid === L.uid ? 'du' : m.name).join(', '))}</p>` : ''}
      ${b.status === 'done' || sum.count ? `
      <div class="avg-box">
        ${sum.avg ? `<strong>${fmtNum(sum.avg, 1)}</strong>${starsView(sum.avg, 'lg')}<small>Club-Durchschnitt aus ${sum.count} ${sum.count === 1 ? 'Bewertung' : 'Bewertungen'}</small>`
          : '<small>Noch keine Bewertungen</small>'}
      </div>
      ${sum.list.length ? `<div class="rating-list">${sum.list.map(r => `
        <div class="v-head"><span class="avatar xs" style="--av:var(--${hue(r.uid)})">${initial(r.name)}</span>
          <div><strong>${esc(r.name)}${r.uid === L.uid ? ' <small>(du)</small>' : ''}</strong></div>${starsView(r.rating)}</div>`).join('')}</div>` : ''}` : ''}
      ${canRate ? `<label class="lbl center">Deine Bewertung</label>${starsInput('myStars', myRating(entry, slug), true)}` : ''}
      <div class="cbd-actions">
        ${linked ? `<p class="my-line">${icon('check')}In deinen Büchern${mine.status === 'reading' ? ` · Seite ${pageTxt(mine.currentPage)}` : ''}</p>`
          : mine ? `<button class="btn primary" data-act="clubJoinBook" data-slug="${esc(slug)}">${icon('check')}Mit „${esc(mine.title)}“ verknüpfen</button>`
          : `<button class="btn primary" data-act="clubJoinBook" data-slug="${esc(slug)}">${icon('plus')}${b.status === 'done' ? 'In meine Bücher (gelesen)' : b.status === 'want' ? 'Auf meine Wunschliste' : 'Lese ich auch'}</button>`}
        ${b.status === 'want' ? `<button class="btn tonal" data-s="start">${icon('play')}Das lesen wir jetzt</button>` : ''}
        <button class="btn ghost" data-act="clubBookEdit" data-slug="${esc(slug)}">${icon('edit')}Bearbeiten</button>
      </div>`, {
      onMount(root, sheet) {
        hydratePhotos(root);
        root.addEventListener('starchange', e => {
          const v = e.detail.value;
          const cur = myCopy(club.info(), slug, b.title);
          if (cur.linked && cur.book.status === 'finished') store.updateBook(cur.book.id, { rating: { ...(cur.book.rating || {}), overall: v || null } });
          else club.setClubRating(slug, v);
          toast(v ? 'Bewertung gespeichert' : 'Bewertung entfernt', { icon: 'star' });
        });
        root.addEventListener('click', async e => {
          if (e.target.closest('[data-act="clubBookEdit"]')) { e.stopPropagation(); closeSheet(sheet); setTimeout(() => clubBookForm(slug), 250); return; }
          const cv = e.target.closest('[data-s="cover"]');
          if (cv) {
            // Cover direkt hier hinzufügen oder ändern – sehen alle im Club
            const file = await pickFile('image/*');
            if (!file) return;
            const ok = await busy(cv, async () => {
              const cover = await club.coverFromFile(file);
              await club.updateClubBook(slug, { ...(findClubBook(slug) || b), cover });
              cv.querySelector('.cover').outerHTML = `<div class="cover cover-m"><img class="loaded" alt="" src="${cover}"></div>`;
              cv.querySelector('.cbd-cover-btn').lastChild.textContent = 'Ändern';
              // Eigenes verknüpftes Buch ohne Foto bekommt das Cover auch
              const cur = myCopy(club.info(), slug, b.title);
              if (cur.linked && !cur.book.coverId) store.updateBook(cur.book.id, { coverId: await store.putPhoto(await store.resizeImage(file, 900)) });
              return true;
            });
            if (ok) toast('Cover gespeichert – alle im Club sehen es', { icon: 'camera' });
            return;
          }
          const s = e.target.closest('[data-s="start"]');
          if (s) {
            const ok = await busy(s, () => club.updateClubBook(slug, { ...b, status: 'current', start: b.start || today() }).then(() => true));
            if (ok) { selected[club.live.code] = slug; closeSheet(sheet); toast(`„${b.title}“ lest ihr jetzt`); }
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
        hydratePhotos(list);
        btn.disabled = !chosen.size;
        btn.querySelector('span').textContent = chosen.size ? (chosen.size === 1 ? '1 Zitat teilen' : `${chosen.size} Zitate teilen`) : 'Zitate auswählen';
      };
      root.querySelector('#pq-term').addEventListener('input', e => { term = e.target.value; list.innerHTML = listHtml(); hydratePhotos(list); });
      hydratePhotos(list);
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

/* ---------- Hilfen für Clubbücher ---------- */

/** Cover eines Clubbuchs: eigenes Foto (falls verknüpft), sonst Club-Cover, sonst buntes Cover */
function clubCover(b, size, mine = null) {
  if (mine && mine.coverId) return coverHtml(mine, size);
  if (b.cover) return `<div class="cover cover-${size}"><img class="loaded" alt="" src="${b.cover}"></div>`;
  return coverHtml(fakeBook(b), size);
}

function findClubBook(slug) {
  const s = clubShelf(club.live.books, club.live.members);
  return [...s.current, ...s.want, ...s.done].find(x => x.slug === slug) || null;
}

/** Club-Cover als eigenes Foto speichern (für Bücher, die man aus dem Club übernimmt) */
async function localCoverFrom(b) {
  if (!b || !b.cover) return null;
  try { return await store.putPhoto(await (await fetch(b.cover)).blob()); } catch (e) { return null; }
}

function closeSheetsFor() { closeAllSheets(); }

/** Kachel im Club auf der Club-Seite: Regal mit Zahlen und kleinen Covern */
function shelfTeaser(shelf) {
  const all = [...shelf.current, ...shelf.want, ...shelf.done];
  const n = (k, one, many) => `${shelf[k].length} ${shelf[k].length === 1 ? one : many}`;
  return `<button class="card shelf-teaser" data-act="openClubShelf">
    <div class="st-covers">${all.slice(0, 5).map(b => clubCover(b, 'xs')).join('') || `<span class="st-empty">${icon('books')}</span>`}</div>
    <div class="st-txt"><strong>Unser Regal</strong>
      <small>${[n('current', 'lesen wir', 'lesen wir'), n('want', 'Wunsch', 'Wünsche'), n('done', 'gelesen', 'gelesen')].join(' · ')}</small></div>
    ${icon('chevronRight')}
  </button>`;
}

/* ---------- Seite „Unser Regal“ (wie „Bücher“, nur für den Club) ---------- */

let shelfFilter = 'current';
let shelfSearch = '';

VIEWS.clubShelf = {
  render(params, onlyResults = false) {
    const L = club.live;
    const shelf = clubShelf(L.books, L.members);
    const entry = club.info();
    const s = shelfSearch.trim().toLowerCase();
    let list = shelf[shelfFilter] || [];
    if (s) list = [...shelf.current, ...shelf.want, ...shelf.done].filter(b => `${b.title} ${b.author || ''}`.toLowerCase().includes(s));
    const opts = [['current', 'Lesen wir'], ['want', 'Wunsch'], ['done', 'Gelesen']];
    const header = `
    <header class="page-head sub"><button class="back" data-act="back">${icon('chevronLeft')}Club</button></header>
    <header class="page-head">
      <div><p class="eyebrow">${esc((L.group && L.group.name) || 'Buchclub')}</p><h1>Unser Regal</h1></div>
      <div class="head-btns"><button class="round accent" data-act="shelfAdd" aria-label="Clubbuch hinzufügen">${icon('plus')}</button></div>
    </header>
    <div class="search">${icon('search')}<input id="shelf-search" class="input" type="search" placeholder="Titel oder Autor:in suchen" value="${esc(shelfSearch)}"></div>`;
    const results = `
    ${s ? '' : segmented('shelfFilter', opts.map(([v, l]) => [v, `${l} ${shelf[v].length || ''}`.trim()]), shelfFilter)}
    ${s || !list.length ? '' : `<button class="btn tonal shelf-add" data-act="shelfAdd">${icon('plus')}${{ current: 'Clubbuch hinzufügen', want: 'Wunschbuch hinzufügen', done: 'Gelesenes Buch nachtragen' }[shelfFilter]}</button>`}
    ${list.length ? `<div class="book-grid">${list.map(b => {
      const { book: mine, linked } = myCopy(entry, b.slug, b.title);
      const sum = ratingSummary(L.members, b.slug);
      const readers = L.members.filter(m => memberBooks(m)[b.slug]).length;
      const sub = b.status === 'done' ? (sum.avg ? `${starsView(sum.avg, 'xs')} <span class="bt-avg">${fmtNum(sum.avg, 1)}</span>` : esc(b.author || ''))
        : b.status === 'want' ? esc(b.author || '') : `${readers} ${readers === 1 ? 'liest' : 'lesen'} mit`;
      return `<button class="book-tile" data-act="clubBookDetail" data-slug="${esc(b.slug)}">
        <div class="bt-cover">${clubCover(b, 'l', linked ? mine : null)}${linked ? `<span class="bt-mine">${icon('check')}</span>` : ''}</div>
        <strong>${esc(b.title)}</strong>
        <small>${sub}</small>
      </button>`;
    }).join('')}</div>` : `
      <div class="empty">${icon(s ? 'search' : 'books')}<p>${s ? 'Nichts gefunden.' : {
        current: 'Gerade lest ihr kein Buch. Lege eines an oder nimm eines von der Wunschliste.',
        want: 'Eure Wunschliste ist leer. Hier sammelt ihr Bücher, die ihr gemeinsam lesen wollt.',
        done: 'Noch nichts im Regal. Trage Bücher nach, die ihr schon gemeinsam gelesen habt.',
      }[shelfFilter]}</p>${s ? '' : `<button class="btn tonal" data-act="shelfAdd">${icon('plus')}${{ current: 'Clubbuch hinzufügen', want: 'Wunschbuch hinzufügen', done: 'Gelesenes Buch nachtragen' }[shelfFilter]}</button>`}</div>`}`;
    return onlyResults ? results : header + `<div id="shelf-results">${results}</div>`;
  },
  mount(root) {
    const input = root.querySelector('#shelf-search');
    input.addEventListener('input', () => {
      shelfSearch = input.value;
      const box = root.querySelector('#shelf-results');
      box.innerHTML = VIEWS.clubShelf.render({}, true);
      hydratePhotos(box);
    });
    root.addEventListener('segchange', e => { if (e.detail.name === 'shelfFilter') { shelfFilter = e.detail.value; render(); } });
  },
};

A.shelfAdd = () => clubBookForm(null, { status: shelfFilter });

/* ---------- Clubbuch anlegen / bearbeiten (aufgebaut wie „Buch hinzufügen“) ---------- */

function clubBookForm(slug = null, preset = {}) {
  const existing = slug ? findClubBook(slug) : null;
  const entry = club.info();
  const b = existing ? { ...existing } : { title: '', author: '', total: '', isbn: '', blurb: '', status: 'current', start: today(), end: null, cover: '', ...preset };
  if (!existing && b.status === 'done') { b.start = null; b.end = today(); }
  if (!existing && b.status === 'want') b.start = null;
  const hasBooks = store.get().books.length > 0;
  const linkedId = existing && entry && entry.links[slug];
  let status = b.status || 'current';
  let cover = b.cover || '';          // Club-Cover (Bild-Text)
  let photoBlob = null;               // Foto für das eigene Buch
  let fromLocal = null;               // eigenes Buch, aus dem übernommen wurde
  let stars = existing ? myRating(entry, slug) : 0;
  let mineToo = true;

  const html = `
    ${sheetHead(existing ? 'Clubbuch bearbeiten' : status === 'done' ? 'Gelesenes Buch nachtragen' : status === 'want' ? 'Wunschbuch hinzufügen' : 'Clubbuch hinzufügen', { action: 'cfSave', actionLabel: 'Sichern' })}
    <div class="form">
      ${!existing && hasBooks ? `<button class="btn tonal" data-s="mine">${icon('books')}Aus meinen Büchern übernehmen</button>` : ''}
      <div class="photo-row single">
        <button class="photo-slot" data-s="photo">${cover ? `<img class="loaded" alt="" src="${cover}">` : `<span class="ps-empty">${icon('camera')}<small>Cover hinzufügen</small></span>`}</button>
        <div class="photo-actions">
          <button class="btn tonal" data-s="scan">${icon('barcode')}ISBN scannen</button>
          <p class="hint">Das Cover sehen alle im Club. Titel und Autor:in werden vom Foto gelesen.</p>
        </div>
      </div>
      <div class="ocr-status" hidden></div>
      <label class="lbl" for="cf-title">Titel</label>
      <input id="cf-title" class="input" maxlength="120" value="${esc(b.title)}" placeholder="Buchtitel" autocomplete="off">
      <label class="lbl" for="cf-author">Autor:in</label>
      <input id="cf-author" class="input" maxlength="80" value="${esc(b.author || '')}" placeholder="Vorname Nachname" autocomplete="off">
      <div class="row2">
        <div><label class="lbl" for="cf-pages">Seiten</label><input id="cf-pages" class="input" inputmode="numeric" value="${b.total || ''}" placeholder="z. B. 320"></div>
        <div><label class="lbl" for="cf-isbn">ISBN</label><input id="cf-isbn" class="input" inputmode="numeric" value="${esc(b.isbn ? fmtIsbn(b.isbn) : '')}" placeholder="978-…"></div>
      </div>
      <label class="lbl">Status im Club</label>
      ${segmented('cfStatus', [['current', 'Lesen wir'], ['want', 'Wunsch'], ['done', 'Gelesen']], status)}
      <div class="row2">
        <div class="cf-start" ${status === 'want' ? 'hidden' : ''}><label class="lbl" for="cf-start">Beginn</label><input id="cf-start" class="input" type="date" value="${esc(b.start || '')}"></div>
        <div class="cf-end" ${status === 'done' ? '' : 'hidden'}><label class="lbl" for="cf-end">Ende</label><input id="cf-end" class="input" type="date" value="${esc(b.end || '')}"></div>
      </div>
      <div class="cf-stars" ${status === 'done' ? '' : 'hidden'}>
        <label class="lbl center">Deine Bewertung</label>
        ${starsInput('cfStars', stars, true)}
      </div>
      <label class="lbl" for="cf-blurb">Klappentext <small>(optional)</small></label>
      <textarea id="cf-blurb" class="input" rows="3" maxlength="1500" placeholder="Worum geht es?">${esc(b.blurb || '')}</textarea>
      ${!existing ? `<div class="list-row cf-mine"><span>${icon('book')}Auch in meine Bücher <small class="cf-mine-hint"></small></span>${toggle('cfMine', true)}</div>` : ''}
      ${linkedId ? `<button class="btn ghost" data-s="unlink">${icon('close')}Mein Exemplar lösen</button>` : ''}
      ${existing && (club.isAdmin() || existing.addedBy === club.live.uid || existing.implicit) ? `<button class="btn ghost danger" data-s="delete">${icon('trash')}Aus dem Club entfernen</button>` : ''}
    </div>`;

  openSheet(html, {
    tall: true,
    onMount(root, sheet) {
      const $ = s => root.querySelector(s);
      const ocrStatus = $('.ocr-status');
      const showStatus = t => { ocrStatus.hidden = !t; ocrStatus.innerHTML = t ? `<span class="spinner"></span>${esc(t)}` : ''; };
      const mineHint = () => { const h = $('.cf-mine-hint'); if (h) h.textContent = { current: 'als „Lese ich“', want: 'auf die Wunschliste', done: 'als gelesen' }[status]; };
      const showStatusFields = () => {
        $('.cf-start').hidden = status === 'want';
        $('.cf-end').hidden = status !== 'done';
        $('.cf-stars').hidden = status !== 'done';
        if (status === 'done' && !$('#cf-end').value) $('#cf-end').value = today();
        mineHint();
      };
      mineHint();
      const setCover = (dataUrl) => { cover = dataUrl; $('[data-s="photo"]').innerHTML = `<img class="loaded" alt="" src="${dataUrl}">`; };

      root.addEventListener('segchange', e => { if (e.detail.name === 'cfStatus') { status = e.detail.value; showStatusFields(); } });
      root.addEventListener('starchange', e => { stars = e.detail.value; });
      root.addEventListener('togglechange', e => { mineToo = e.detail.on; });

      root.addEventListener('click', async e => {
        const btn = e.target.closest('[data-s], [data-act="cfSave"]');
        if (!btn) return;
        if (btn.dataset.act === 'cfSave') { e.stopPropagation(); return save(btn); }
        const s = btn.dataset.s;
        if (s === 'mine') {
          bookPicker('Aus meinen Büchern', 'Die Angaben und das Cover werden übernommen.', async lb => {
            fromLocal = lb.id;
            $('#cf-title').value = lb.title; $('#cf-author').value = lb.author || '';
            $('#cf-pages').value = lb.totalPages || ''; $('#cf-isbn').value = lb.isbn ? fmtIsbn(lb.isbn) : '';
            $('#cf-blurb').value = lb.blurb || '';
            status = ownToClubStatus(lb.status);
            root.querySelectorAll('.seg [data-name="cfStatus"]').forEach(x => x.classList.toggle('on', x.dataset.value === status));
            $('#cf-start').value = lb.startedAt ? dayKey(lb.startedAt) : '';
            $('#cf-end').value = lb.status === 'finished' && lb.finishedAt ? dayKey(lb.finishedAt) : '';
            if (lb.rating && lb.rating.overall) stars = lb.rating.overall;
            showStatusFields();
            const row = $('.cf-mine'); if (row) row.hidden = true;
            if (lb.coverId) {
              const blob = await store.getPhoto(lb.coverId);
              if (blob) setCover(await club.coverFromFile(blob));
            }
            toast('Angaben übernommen');
          });
        } else if (s === 'photo') {
          const file = await pickFile('image/*');
          if (!file) return;
          try {
            setCover(await club.coverFromFile(file));
            photoBlob = await store.resizeImage(file, 900);
            showStatus('Lese Titel vom Cover …');
            const res = await ocrCover(file, showStatus);
            if (!$('#cf-title').value.trim() && res.title) $('#cf-title').value = res.title;
            if (!$('#cf-author').value.trim() && res.author) $('#cf-author').value = res.author;
          } catch (err) { toast(err.message || 'Foto konnte nicht gelesen werden', { icon: 'info' }); }
          finally { showStatus(''); }
        } else if (s === 'scan') {
          const isbn = await scanIsbn().catch(err => { toast(err.message, { icon: 'info' }); return null; });
          if (isbn) {
            $('#cf-isbn').value = fmtIsbn(isbn);
            const own = store.get().books.find(x => x.isbn === isbn);
            if (own && !$('#cf-title').value.trim()) { $('#cf-title').value = own.title; $('#cf-author').value = own.author || ''; toast(`„${own.title}“ aus deinen Büchern erkannt`); }
            else toast('ISBN erkannt');
          }
        } else if (s === 'unlink') {
          club.linkBook(slug, null); closeSheet(sheet); toast('Verknüpfung gelöst');
        } else if (s === 'delete') {
          const ok = await confirmDialog({ title: `„${existing.title}“ entfernen?`, text: 'Das Buch verschwindet für alle aus dem Club-Regal. Eure eigenen Bücher bleiben erhalten.', ok: 'Entfernen', danger: true });
          if (ok && await busy(null, () => club.deleteClubBook(slug).then(() => true))) { closeSheet(sheet); toast('Entfernt', { icon: 'trash' }); }
        }
      });

      async function save(btn) {
        const title = $('#cf-title').value.trim();
        if (!title) { $('#cf-title').focus(); toast('Bitte einen Titel eintragen', { icon: 'info' }); return; }
        const isbnRaw = $('#cf-isbn').value.trim();
        const isbn = isbnRaw ? normalizeIsbn(isbnRaw) : '';
        if (isbnRaw && !isbn) { toast('Die ISBN ist ungültig', { icon: 'info' }); return; }
        const start = status === 'want' ? null : ($('#cf-start').value || null);
        const end = status === 'done' ? ($('#cf-end').value || null) : null;
        if (start && end && end < start) { toast('Das Ende liegt vor dem Beginn', { icon: 'info' }); return; }
        const fields = { title, author: $('#cf-author').value.trim(), total: Number($('#cf-pages').value.replace(/\D/g, '')) || 0,
          isbn: isbn || '', blurb: $('#cf-blurb').value.trim(), status, start, end, cover };

        let theSlug = slug;
        if (existing) {
          const ok = await busy(btn, () => club.updateClubBook(slug, { ...existing, ...fields }).then(() => true));
          if (!ok) return;
        } else {
          const res = await busy(btn, () => club.addClubBook(fields));
          if (!res) return;
          theSlug = res.slug;
          if (res.existed) {
            const old = findClubBook(res.slug) || {};
            await busy(null, () => club.updateClubBook(res.slug, { ...old, ...fields, cover: cover || old.cover || '' }));
          }
          // Eigenes Exemplar verknüpfen oder anlegen
          let local = fromLocal ? store.book(fromLocal) : null;
          if (!local && mineToo) {
            local = store.get().books.find(x => slugify(x.title) === res.slug) || null;
            if (!local) {
              const coverId = photoBlob ? await store.putPhoto(photoBlob) : await localCoverFrom({ cover });
              local = store.addBook({ title, author: fields.author, totalPages: fields.total, isbn: fields.isbn, blurb: fields.blurb, coverId,
                status: clubToOwnStatus(status), startedAt: start ? keepTime(start) : null,
                finishedAt: status === 'done' ? (end ? keepTime(end) : Date.now()) : null,
                currentPage: status === 'done' ? fields.total : 0,
                rating: status === 'done' && stars ? { overall: stars } : null });
            }
          }
          if (local) club.linkBook(theSlug, local.id);
        }
        // Sterne: beim eigenen gelesenen Buch speichern, sonst als Club-Bewertung
        if (status === 'done' && stars) {
          const cur = myCopy(club.info(), theSlug, title);
          if (cur.linked && cur.book.status === 'finished') store.updateBook(cur.book.id, { rating: { ...(cur.book.rating || {}), overall: stars } });
          else club.setClubRating(theSlug, stars);
        }
        if (status === 'current') selected[club.live.code] = theSlug;
        closeSheet(sheet);
        toast(existing ? 'Gespeichert' : `„${title}“ ist im Club-Regal`, { icon: 'books' });
        render();
      }
    },
  });
}
