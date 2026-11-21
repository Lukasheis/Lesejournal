// view-book.js – Buchdetail mit Fortschrittskreis, Sessions, Zitaten, Reflexion
import * as store from './store.js';
import { fmtNum, fmtDate, fmtTime, fmtDuration, fmtIsbn, bookProgress, pagesLeft, pagesPerHour, finishForecast, totalSeconds, sessionPages, RATING_CATEGORIES } from './core.js';
import { icon } from './icons.js';
import { esc, A, coverHtml, starsView } from './ui.js';
import { ring } from './charts.js';
import { VIEWS, nav } from './nav.js';
import { startSessionSheet } from './session.js';
import { bookForm, quoteSheet, logSheet, finishBookFlow, setStatus, sessionSheet } from './sheets.js';
import { quoteItem, LABELS } from './view-books.js';

VIEWS.book = {
  render({ id }) {
    const b = store.book(id);
    if (!b) return `<header class="page-head sub"><button class="back" data-act="back">${icon('chevronLeft')}Zurück</button></header><div class="empty"><p>Dieses Buch gibt es nicht mehr.</p></div>`;
    const d = store.get();
    const sessions = store.sessionsOf(id);
    const quotes = store.quotesOf(id);
    const p = bookProgress(b);
    const tempoBook = pagesPerHour(sessions);
    const tempo = tempoBook || pagesPerHour(d.sessions);
    const fc = finishForecast(b, d.sessions);
    const secs = totalSeconds(sessions);
    const active = d.activeSession && d.activeSession.bookId === id;

    let main = '';
    if (b.status === 'reading') {
      const left = pagesLeft(b);
      const hoursLeft = tempo ? left / tempo : null;
      main = `
      <section class="card progress-card">
        ${ring(p, { size: 150, stroke: 15, label: `${Math.round(p * 100)}<small>%</small>`, sub: `Seite ${fmtNum(b.currentPage)} / ${fmtNum(b.totalPages)}` })}
        <div class="pc-side">
          <div class="kv">${icon('bookmark')}<span><strong>${fmtNum(left)}</strong> Seiten übrig</span></div>
          ${b.totalChapters ? `<div class="kv">${icon('list')}<span>Kapitel <strong>${fmtNum(b.currentChapter || 0)}</strong> von ${fmtNum(b.totalChapters)}</span></div>` : ''}
          ${hoursLeft != null ? `<div class="kv">${icon('hourglass')}<span>noch ca. <strong>${fmtDuration(hoursLeft * 3600)}</strong></span></div>` : ''}
          ${fc ? `<div class="kv">${icon('flag')}<span>fertig ca. <strong>${fmtDate(fc.date, { year: false })}</strong></span></div>` : ''}
        </div>
      </section>
      <div class="action-row">
        <button class="btn primary big" data-act="startSession" data-id="${id}">${icon(active ? 'timer' : 'play')}${active ? 'Session läuft' : 'Lesen starten'}</button>
      </div>
      <div class="action-row three">
        <button class="btn tonal" data-act="logPages" data-id="${id}">${icon('pen')}Seiten</button>
        <button class="btn tonal" data-act="addQuoteFor" data-id="${id}">${icon('quote')}Zitat</button>
        <button class="btn tonal" data-act="finishBook" data-id="${id}">${icon('check')}Beenden</button>
      </div>`;
    } else if (b.status === 'want') {
      main = `<div class="action-row">
        <button class="btn primary big" data-act="beginBook" data-id="${id}">${icon('book')}Jetzt beginnen</button></div>`;
    } else if (b.status === 'abandoned') {
      main = `<section class="card soft-empty"><p>Abgebrochen am ${fmtDate(b.finishedAt)} bei Seite ${fmtNum(b.currentPage)}.</p>
        <button class="btn tonal" data-act="beginBook" data-id="${id}">${icon('refresh')}Wieder aufnehmen</button></section>`;
    } else if (b.status === 'finished') {
      const r = b.rating || {};
      main = `
      <section class="card rating-card">
        <div class="rc-row"><div>${starsView(r.overall || 0, 'lg')}<p class="muted">Beendet am ${fmtDate(b.finishedAt)}${b.startedAt ? ` · ${fmtNum(Math.max(1, Math.round((b.finishedAt - b.startedAt) / 86400000) + 1))} Tage` : ''}</p></div>
          <button class="round sm" data-act="editRating" data-id="${id}" aria-label="Bewertung bearbeiten">${icon('edit')}</button></div>
        ${RATING_CATEGORIES.some(c => r[c.id]) ? `<div class="cat-bars">${RATING_CATEGORIES.filter(c => r[c.id]).map(c => `
          <div class="cat-bar"><span>${c.name}</span><span class="cb-track"><i style="width:${(r[c.id] / 5) * 100}%"></i></span><b>${String(r[c.id]).replace('.', ',')}</b></div>`).join('')}</div>` : ''}
      </section>
      ${b.reflection && b.reflection.length ? `
      <section>
        <div class="sec-head"><h2>Reflexion</h2></div>
        <div class="card reflection">${b.reflection.map(x => `<div class="rf"><h4>${esc(x.q)}</h4><p>${esc(x.a)}</p></div>`).join('')}</div>
      </section>` : `<button class="btn tonal" data-act="editRating" data-id="${id}">${icon('pen')}Reflexion schreiben</button>`}`;
    }

    return `
    <header class="page-head sub">
      <button class="back" data-act="back">${icon('chevronLeft')}Zurück</button>
      <button class="link" data-act="editBook" data-id="${id}">Bearbeiten</button>
    </header>
    <section class="book-hero">
      ${b.coverId ? `<div class="bh-blur"><img alt="" data-photo="${esc(b.coverId)}"></div>` : '<div class="bh-blur gen"></div>'}
      ${coverHtml(b, 'xl')}
      <div class="bh-txt">
        <span class="status-chip s-${b.status}">${LABELS[b.status]}</span>
        <h1>${esc(b.title)}</h1>
        ${b.author ? `<p>${esc(b.author)}</p>` : ''}
      </div>
    </section>

    ${main}

    <section class="stat-row">
      <div class="stat"><span>${icon('timer')}</span><strong>${secs ? fmtDuration(secs) : '–'}</strong><small>Lesezeit</small></div>
      <div class="stat"><span>${icon('speed')}</span><strong>${tempoBook ? fmtNum(tempoBook) : '–'}</strong><small>Seiten/Std.</small></div>
      <div class="stat"><span>${icon('layers')}</span><strong>${fmtNum(sessions.length)}</strong><small>Sessions</small></div>
    </section>

    ${b.blurb || b.backId ? `
    <details class="card blurb">
      <summary><span>${icon('book')}Klappentext</span>${icon('chevronDown')}</summary>
      ${b.blurb ? `<p>${esc(b.blurb).replace(/\n/g, '<br>')}</p>` : ''}
      ${b.backId ? `<img class="back-photo" alt="Rückseite" data-photo="${esc(b.backId)}">` : ''}
    </details>` : ''}

    <section>
      <div class="sec-head"><h2>Zitate</h2>${quotes.length ? `<span class="count">${quotes.length}</span>` : ''}
        <button class="link" data-act="addQuoteFor" data-id="${id}">${icon('plus')}Neu</button></div>
      ${quotes.length ? `<div class="quote-list">${quotes.map(q => quoteItem(q, false)).join('')}</div>` : '<p class="muted pad">Noch keine Zitate aus diesem Buch.</p>'}
    </section>

    <section>
      <div class="sec-head"><h2>Notizen & Sessions</h2>${sessions.length ? `<span class="count">${sessions.length}</span>` : ''}</div>
      ${sessions.length ? `<div class="timeline">${sessions.map(s => `
        <button class="tl-item" data-act="editSession" data-id="${s.id}">
          <span class="tl-dot"></span>
          <div class="tl-head"><strong>${fmtDate(s.end, { year: false })}</strong><span>${s.manual ? 'nachgetragen' : fmtTime(s.start)}${s.durationSec ? ' · ' + fmtDuration(s.durationSec) : ''}</span>
            <span class="tl-pages">S. ${fmtNum(s.fromPage)}–${fmtNum(s.toPage)}${sessionPages(s) ? ` <b>+${fmtNum(sessionPages(s))}</b>` : ''}</span></div>
          ${s.chapter ? `<span class="tl-chap">Kapitel ${esc(s.chapter)}</span>` : ''}
          ${s.note ? `<p>${esc(s.note).replace(/\n/g, '<br>')}</p>` : '<p class="muted">Keine Notiz – tippen zum Ergänzen</p>'}
        </button>`).join('')}</div>` : '<p class="muted pad">Starte eine Lesesession – danach kannst du kurz notieren, worum es ging.</p>'}
    </section>

    <section class="meta-list card">
      ${b.isbn ? `<div class="meta"><span>ISBN</span><span>${fmtIsbn(b.isbn)}</span></div>` : ''}
      <div class="meta"><span>Hinzugefügt</span><span>${fmtDate(b.addedAt)}</span></div>
      ${b.startedAt ? `<div class="meta"><span>Begonnen</span><span>${fmtDate(b.startedAt)}</span></div>` : ''}
      ${b.totalPages ? `<div class="meta"><span>Seiten</span><span>${fmtNum(b.totalPages)}</span></div>` : ''}
    </section>
    <div class="action-row stack">
      ${b.status === 'reading' ? `<button class="btn ghost" data-act="toWant" data-id="${id}">Zurück auf die Wunschliste</button>
        <button class="btn ghost danger" data-act="abandon" data-id="${id}">Buch abbrechen</button>` : ''}
          </div>`;
  },
};

Object.assign(A, {
  editBook: el => bookForm(el.dataset.id),
  logPages: el => logSheet(el.dataset.id),
  addQuoteFor: el => quoteSheet({ bookId: el.dataset.id }),
  finishBook: el => finishBookFlow(el.dataset.id),
  editRating: el => finishBookFlow(el.dataset.id, { edit: true }),
  beginBook: el => setStatus(el.dataset.id, "reading"),
  abandon: el => setStatus(el.dataset.id, 'abandoned'),
  toWant: el => setStatus(el.dataset.id, 'want'),
  editSession: el => sessionSheet(el.dataset.id),
  startSession: el => startSessionSheet(el.dataset.id),
});

