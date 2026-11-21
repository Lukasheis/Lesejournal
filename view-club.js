// view-club.js – Community-Tab: Buchclub mit Lese-Wettrennen, Treffen, Status und Fazits
import * as store from './store.js';
import * as club from './club.js';
import { fmtNum, fmtDate, clubRace, meetingInfo, fmtDaysUntil, timeAgo, heartsFor, normalizeClubCode, fmtClubCode, dayKey, WEEKDAYS, MONTHS } from './core.js';
import { icon } from './icons.js';
import { esc, A, openSheet, closeSheet, sheetHead, toast, confirmDialog, starsView, coverHtml, moreBtn } from './ui.js';
import { VIEWS, nav, render } from './nav.js';
import { bookForm } from './sheets.js';
import { startSessionSheet } from './session.js';

let animatedFor = null; // Balken nur beim ersten Anzeigen wachsen lassen

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

/** Häufigster Buchtitel = „euer“ Buch */
function mainBook(members) {
  const count = new Map();
  for (const m of members) if (m.bookTitle) {
    const k = m.bookTitle.trim().toLowerCase();
    const c = count.get(k) || { n: 0, m };
    c.n++; count.set(k, c);
  }
  let best = null;
  for (const c of count.values()) if (!best || c.n > best.n) best = c;
  return best ? best.m : null;
}

VIEWS.club = {
  render() {
    const i = club.info();
    if (!i.code) return club.isConfigured() ? joinView() : setupView();
    const L = club.live;
    const g = L.group;
    if (!g) {
      const msg = L.status === 'error' ? L.error : L.status === 'live' ? 'Diese Gruppe gibt es nicht mehr.' : 'Verbinde mit dem Buchclub …';
      return `${head('Club', 'Buchclub')}
        <div class="empty">${L.status === 'connecting' || L.status === 'idle' ? '<span class="spinner big"></span>' : icon('info')}<p>${esc(msg)}</p>
        ${L.status === 'live' || L.status === 'error' ? `<button class="btn tonal" data-act="clubLeave">Gruppe verlassen</button>` : ''}</div>`;
    }
    return groupView(i, L, g);
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

/* ---------- Eingerichtet, aber noch in keiner Gruppe ---------- */

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

/* ---------- In einer Gruppe ---------- */

function groupView(i, L, g) {
  const now = Date.now();
  const my = i.bookId ? store.book(i.bookId) : null;
  const rows = clubRace(L.members);
  const main = mainBook(L.members);
  const meet = meetingInfo(g, now);
  const target = meet && !meet.past && meet.target >= 0.01 ? meet.target : null;
  const grow = animatedFor !== i.code;
  animatedFor = i.code;
  const admin = club.isAdmin();
  const finishedRows = rows.filter(r => r.finished && (r.rating || r.verdict));

  const statusLine = L.status === 'live' ? `<span class="live-dot"></span>Live · ${timeAgo(L.updatedAt, now)}`
    : L.status === 'error' ? `${icon('info')}${esc(L.error || 'Offline')}`
    : `<span class="spinner"></span>Verbinde …`;

  return `
  ${head(esc(g.name || 'Buchclub'), `Buchclub · ${L.members.length} ${L.members.length === 1 ? 'Mitglied' : 'Mitglieder'}`,
    `<button class="round" data-act="clubInvite" aria-label="Einladen">${icon('share')}</button>`)}

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

  ${myCard(i, my, main, L)}

  <section class="card race ${grow ? 'grow' : ''}">
    <div class="card-head"><h3>${icon('flag')}Das Rennen</h3><small class="sync">${statusLine}</small></div>
    ${main ? `<p class="race-book">${esc(main.bookTitle)}${main.bookAuthor ? ` <span>· ${esc(main.bookAuthor)}</span>` : ''}</p>` : ''}
    ${target != null ? `<p class="race-legend"><i></i><span>Soll heute: <b>${Math.round(target * 100)} %</b> – so seid ihr bis zum Treffen fertig</span></p>` : ''}
    <div class="race-list">
      ${rows.map(r => raceRow(r, L, main, target, now)).join('') || '<p class="hint">Noch niemand da.</p>'}
    </div>
  </section>

  ${finishedRows.length ? `
  <h2 class="group-title">Fazits</h2>
  <section class="verdicts">${finishedRows.map(r => `
    <article class="card verdict">
      <div class="v-head"><span class="avatar" style="--av:var(--${hue(r.uid)})">${initial(r.name)}</span>
        <div><strong>${esc(r.name)}${r.uid === L.uid ? ' <small>(du)</small>' : ''}</strong><small>Fertig ${esc(fmtDate(r.finishedAt, { year: false }))}</small></div>
        ${r.rating ? starsView(r.rating) : ''}</div>
      ${r.verdict ? `<p>${esc(r.verdict)}</p>` : ''}
    </article>`).join('')}
  </section>` : ''}

  <h2 class="group-title">Gruppe</h2>
  <section class="card group">
    <button class="g-row link-row" data-act="clubInvite"><span class="g-lbl">${icon('share')}Mitglieder einladen</span><span class="g-val code">${fmtClubCode(i.code)}</span></button>
    <button class="g-row link-row" data-act="clubName"><span class="g-lbl">${icon('pen')}Mein Name</span><span class="g-val">${esc(i.name || '')}${icon('chevronRight')}</span></button>
    ${admin ? `
    <button class="g-row link-row" data-act="clubRename"><span class="g-lbl">${icon('edit')}Gruppenname ändern</span>${icon('chevronRight')}</button>
    <button class="g-row link-row" data-act="clubMembers"><span class="g-lbl">${icon('club')}Mitglieder verwalten</span>${icon('chevronRight')}</button>` : ''}
    <button class="g-row link-row" data-act="clubHelp"><span class="g-lbl">${icon('shield')}Was wird geteilt?</span>${icon('chevronRight')}</button>
    <button class="g-row link-row danger" data-act="clubLeave"><span class="g-lbl">${icon('close')}Gruppe verlassen</span></button>
  </section>`;
}

function myCard(i, my, main, L) {
  if (!my) {
    const ownMatch = main ? store.get().books.find(b => b.title.trim().toLowerCase() === main.bookTitle.trim().toLowerCase()) : null;
    return `<section class="card my-club">
      <h3>Welches Buch liest du für den Club?</h3>
      <p class="hint">Dein Fortschritt bei diesem Buch erscheint dann im Rennen.</p>
      <div class="my-actions stack">
        ${main && ownMatch ? `<button class="btn primary" data-act="clubLink" data-id="${ownMatch.id}">${icon('check')}„${esc(main.bookTitle)}“ nehmen</button>` : ''}
        ${main && !ownMatch ? `<button class="btn primary" data-act="clubAddMain">${icon('plus')}„${esc(main.bookTitle)}“ anlegen</button>` : ''}
        <button class="btn tonal" data-act="clubPick">${icon('books')}Aus meinen Büchern</button>
      </div>
    </section>`;
  }
  const finished = my.status === 'finished';
  return `<section class="card my-club linked">
    <div class="my-row">${coverHtml(my, 's')}
      <div><small class="eyebrow">Dein Clubbuch</small><strong>${esc(my.title)}</strong>
      <small>${finished ? 'Fertig gelesen' : `Seite ${pageTxt(my.currentPage)} von ${pageTxt(my.totalPages)}`}</small></div>
      <button class="round sm" data-act="clubPick" aria-label="Clubbuch wechseln">${icon('refresh')}</button>
    </div>
    ${i.status ? `<p class="my-status">„${esc(i.status)}“</p>` : ''}
    <div class="my-actions">
      ${finished
        ? `<button class="btn primary" data-act="clubVerdict">${icon('star')}${i.verdict ? 'Fazit bearbeiten' : 'Fazit teilen'}</button>`
        : `<button class="btn primary" data-act="clubRead" data-id="${my.id}">${icon('timer')}Weiterlesen</button>`}
      <button class="btn tonal" data-act="clubStatus">${icon('pen')}Status</button>
    </div>
  </section>`;
}

function raceRow(r, L, main, target, now) {
  const me = r.uid === L.uid;
  const p = r.progress;
  const hearts = r.statusAt ? heartsFor(L.hearts, r.uid, r.statusAt, L.uid) : null;
  const other = main && r.bookTitle && r.bookTitle.trim().toLowerCase() !== main.bookTitle.trim().toLowerCase();
  const behind = target != null && !r.finished && !r.noBook && p + 0.02 < target;
  const sub = r.noBook ? 'Hat noch kein Clubbuch gewählt'
    : r.finished ? `Fertig am ${fmtDate(r.finishedAt, { year: false })}`
    : [`S. ${pageTxt(r.page)} von ${pageTxt(r.total)}`, r.pace ? paceTxt(r.pace) : null, r.updatedAt ? timeAgo(r.updatedAt, now) : null].filter(Boolean).join(' · ');
  return `<div class="race-row ${me ? 'me' : ''} ${r.finished ? 'done' : ''} ${r.noBook ? 'nobook' : ''}" style="--p:${p};--av:var(--${hue(r.uid)})">
    <div class="race-top">
      <span class="race-rank">${r.noBook ? '–' : r.rank}</span>
      <strong>${esc(r.name)}${me && r.name.toLowerCase() !== 'du' ? ' <small>(du)</small>' : ''}</strong>
      ${r.finished && r.rating ? starsView(r.rating, 'xs') : ''}
      <span class="race-pct">${r.noBook ? '' : `${r.pct} %`}</span>
    </div>
    <div class="race-track">
      <span class="race-fill"></span>
      ${target != null ? `<span class="race-target" style="--t:${target}"></span>` : ''}
      <span class="race-runner">${r.finished ? icon('trophy') : initial(r.name)}</span>
    </div>
    <p class="race-sub">${esc(sub)}${behind ? ' <span class="badge warn">hinter Soll</span>' : ''}</p>
    ${other ? `<p class="race-sub other">${icon('book')}liest „${esc(r.bookTitle)}“</p>` : ''}
    ${r.status ? `<div class="race-status"><p>„${esc(r.status)}“ <small>${esc(timeAgo(r.statusAt, now))}</small></p>
      <button class="heart ${hearts && hearts.mine ? 'on' : ''}" ${me ? 'disabled' : `data-act="clubHeart" data-to="${esc(r.uid)}" data-at="${r.statusAt}"`} aria-label="Herz">${icon('heart')}<span>${hearts && hearts.count ? hearts.count : ''}</span></button></div>` : ''}
  </div>`;
}

/* ---------- Live neu zeichnen ---------- */

club.onLive(() => {
  if (nav.current.name === 'club') render();
});

/* ---------- Aktionen ---------- */

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

Object.assign(A, {
  openMore: () => nav.push('more'),
  clubDemo: () => { club.startDemo(); render({ top: true, anim: 'fade' }); },
  clubDemoEnd: () => { club.stopDemo(); animatedFor = null; render({ top: true, anim: 'fade' }); },

  clubHelp() {
    openSheet(`<h2 class="sheet-title">Was wird geteilt?</h2>
      <div class="help">
        <p><strong>Mit deiner Gruppe teilst du nur:</strong></p>
        <ul><li>deinen Namen (den du selbst wählst)</li><li>Titel und Autor:in deines Clubbuchs</li><li>deine aktuelle Seite und dein Tempo (Seiten pro Tag)</li><li>deinen Status-Satz, falls du einen schreibst</li><li>nach dem Fertiglesen deine Sterne und dein Fazit</li></ul>
        <p><strong>Am iPhone bleiben:</strong> alle anderen Bücher, Notizen, Zitate, Fotos, Reflexionsfragen und Statistiken.</p>
        <p>Die Club-Daten liegen in einer Gratis-Datenbank von Google Firebase (Server in Frankfurt). Mitglieder brauchen kein Konto: Die App meldet sich anonym an. Nur wer den Gruppen-Code kennt, sieht die Gruppe.</p>
        <p>Wenn du die Gruppe verlässt, wird dein Eintrag gelöscht.</p>
      </div>`);
  },

  clubCreate() {
    openSheet(`${sheetHead('Neue Gruppe', { action: 'ccSave', actionLabel: 'Erstellen' })}
      <div class="form">
        <label class="lbl" for="cc-group">Name der Gruppe</label>
        <input id="cc-group" class="input" maxlength="40" placeholder="z. B. Buchclub Donnerstag" autocomplete="off">
        <label class="lbl" for="cc-name">Dein Name</label>
        <input id="cc-name" class="input" maxlength="30" value="${esc(club.info().name || '')}" placeholder="So sehen dich die anderen" autocomplete="given-name">
        <p class="hint">Danach bekommst du einen Code, den du deinen Mitgliedern schickst.</p>
      </div>`, {
      onMount(root, entry) {
        root.querySelector('[data-act="ccSave"]').addEventListener('click', async e => {
          e.stopPropagation();
          const groupName = root.querySelector('#cc-group').value.trim();
          const name = root.querySelector('#cc-name').value.trim();
          if (!groupName || !name) { toast('Bitte beide Namen eintragen', { icon: 'info' }); return; }
          const code = await busy(e.currentTarget, () => club.createGroup({ groupName, name }));
          if (code) { closeSheet(entry); animatedFor = null; nav.tab('club'); setTimeout(() => A.clubInvite(), 500); }
        });
      },
    });
  },

  clubJoin() {
    openSheet(`${sheetHead('Gruppe beitreten', { action: 'cjSave', actionLabel: 'Beitreten' })}
      <div class="form">
        <label class="lbl" for="cj-code">Gruppen-Code</label>
        <input id="cj-code" class="input code-input" maxlength="9" placeholder="ABCD-EFGH" autocapitalize="characters" autocomplete="off" spellcheck="false">
        <label class="lbl" for="cj-name">Dein Name</label>
        <input id="cj-name" class="input" maxlength="30" value="${esc(club.info().name || '')}" placeholder="So sehen dich die anderen" autocomplete="given-name">
      </div>`, {
      onMount(root, entry) {
        root.querySelector('[data-act="cjSave"]').addEventListener('click', async e => {
          e.stopPropagation();
          const code = normalizeClubCode(root.querySelector('#cj-code').value);
          const name = root.querySelector('#cj-name').value.trim();
          if (!code) { toast('Der Code hat 8 Zeichen, z. B. ABCD-EFGH', { icon: 'info' }); return; }
          if (!name) { toast('Bitte deinen Namen eintragen', { icon: 'info' }); return; }
          const g = await busy(e.currentTarget, () => club.joinGroup({ code, name }));
          if (g) { closeSheet(entry); animatedFor = null; toast(`Willkommen bei „${g.name}“`); render({ top: true, anim: 'fade' }); setTimeout(() => { if (!club.info().bookId) A.clubPick(); }, 600); }
        });
      },
    });
  },

  async clubInvite() {
    const i = club.info();
    const g = club.live.group;
    const url = location.origin + location.pathname;
    const text = `Komm in unseren Buchclub „${g ? g.name : ''}“ im Lesejournal!\n\n1. Diese Seite in Safari öffnen: ${url}\n2. Teilen → „Zum Home-Bildschirm“\n3. In der App: Club → „Mit Code beitreten“\n\nCode: ${fmtClubCode(i.code)}`;
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) { /* abgebrochen */ } return; }
    try { await navigator.clipboard.writeText(text); toast('Einladung kopiert'); } catch (e) { toast(`Code: ${fmtClubCode(i.code)}`, { icon: 'info' }); }
  },

  clubName() {
    textSheet({ title: 'Mein Name', label: 'So sehen dich die anderen', value: club.info().name, max: 30,
      save: async v => { if (!v) throw new Error('Bitte einen Namen eintragen'); club.setInfo({ name: v }); } });
  },

  clubRename() {
    textSheet({ title: 'Gruppenname', label: 'Name der Gruppe', value: club.live.group?.name || '', max: 40,
      save: async v => { if (!v) throw new Error('Bitte einen Namen eintragen'); await club.renameGroup(v); } });
  },

  clubStatus() {
    const i = club.info();
    textSheet({ title: 'Status', label: 'Wie läuft es mit dem Buch?', value: i.status, max: 120, multiline: true,
      placeholder: 'z. B. Kapitel 12 war heftig!', hint: 'Die anderen können mit einem Herz reagieren.',
      chips: ['Kann es nicht weglegen!', 'Komme gut voran', 'Hänge etwas hinterher', 'Zieht sich gerade …'],
      clear: i.status ? 'Status löschen' : null,
      save: async v => { club.setInfo({ status: v, statusAt: v ? Date.now() : null }); } });
  },

  clubVerdict() {
    const i = club.info();
    const b = i.bookId ? store.book(i.bookId) : null;
    textSheet({ title: 'Fazit', label: 'Dein Fazit für die Gruppe', value: i.verdict, max: 280, multiline: true,
      placeholder: 'Was hat dir gefallen, was nicht?',
      hint: b && b.rating && b.rating.overall ? `Deine Sterne (${String(b.rating.overall).replace('.', ',')}) werden mitgeteilt.` : 'Sterne vergibst du beim Abschließen des Buchs.',
      clear: i.verdict ? 'Fazit löschen' : null,
      save: async v => { club.setInfo({ verdict: v }); } });
  },

  clubPick() {
    const d = store.get();
    const order = { reading: 0, want: 1, finished: 2, abandoned: 3 };
    const list = d.books.slice().sort((a, b) => (order[a.status] - order[b.status]) || ((b.addedAt || 0) - (a.addedAt || 0)));
    const cur = club.info().bookId;
    openSheet(`<h2 class="sheet-title">Clubbuch wählen</h2>
      <div class="pick-list">
        ${list.map(b => `<button class="pick-book ${b.id === cur ? 'on' : ''}" data-pick="${b.id}">${coverHtml(b, 's')}
          <span><strong>${esc(b.title)}</strong><small>${esc(b.author || '')}${b.status === 'finished' ? ' · gelesen' : b.status === 'want' ? ' · Wunschliste' : ''}</small></span>
          ${b.id === cur ? icon('check') : ''}</button>`).join('') || '<p class="hint">Noch keine Bücher.</p>'}
      </div>
      <button class="btn tonal big" data-new>${icon('plus')}Neues Buch anlegen</button>`, {
      tall: list.length > 5,
      onMount(root, entry) {
        root.addEventListener('click', e => {
          const p = e.target.closest('[data-pick]');
          if (p) { linkBook(p.dataset.pick); closeSheet(entry); return; }
          if (e.target.closest('[data-new]')) { closeSheet(entry); setTimeout(() => addAndLink({}), 250); }
        });
      },
    });
  },

  clubLink: el => linkBook(el.dataset.id),

  clubAddMain() {
    const m = mainBook(club.live.members);
    addAndLink(m ? { title: m.bookTitle, author: m.bookAuthor || '', totalPages: m.total || '' } : {});
  },

  clubRead: el => startSessionSheet(el.dataset.id),

  async clubHeart(el) {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    await busy(null, () => club.toggleHeart(el.dataset.to, Number(el.dataset.at), on));
  },

  clubMeeting() {
    const g = club.live.group || {};
    const today = dayKey(Date.now());
    openSheet(`${sheetHead('Treffen', { action: 'cmSave', actionLabel: 'Sichern' })}
      <div class="form">
        <label class="lbl" for="cm-date">Datum</label>
        <input id="cm-date" class="input" type="date" min="${today}" value="${esc(g.meetingDate && g.meetingDate >= today ? g.meetingDate : '')}">
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

  async clubLeave() {
    const demo = club.isDemo();
    const ok = demo || await confirmDialog({ title: 'Gruppe verlassen?', text: 'Dein Eintrag wird aus der Gruppe gelöscht. Mit dem Code kannst du jederzeit wieder beitreten.', ok: 'Verlassen', danger: true });
    if (!ok) return;
    await club.leaveGroup();
    animatedFor = null;
    render({ top: true, anim: 'fade' });
  },
});

function linkBook(id) {
  const b = store.book(id);
  club.setInfo({ bookId: id, verdict: '' });
  if (club.isDemo()) render();
  toast(b ? `„${b.title}“ ist dein Clubbuch` : 'Clubbuch gewählt');
}

/** Buch anlegen und danach automatisch als Clubbuch verknüpfen */
function addAndLink(preset) {
  const before = new Set(store.get().books.map(b => b.id));
  const off = store.onChange(d => {
    const nb = d.books.find(b => !before.has(b.id));
    if (nb) { off(); setTimeout(() => linkBook(nb.id), 0); }
  });
  setTimeout(off, 15 * 60000);
  bookForm(null, preset);
}

