// view-today.js – Startseite "Heute"
import * as store from './store.js';
import { greeting, fmtDate, fmtNum, fmtClock, dayKey, dailyTotals, streaks, bookProgress, quoteOfDay, quoteSource, backupDue, elapsedSec, remainingSec, addDays, startOfDay, WEEKDAYS_SHORT, WEEKDAYS, MONTHS, pendingChanges, APP_VERSION } from './core.js';
import { icon } from './icons.js';
import { esc, A, coverHtml, moreBtn } from './ui.js';
import { ring } from './charts.js';
import { VIEWS, nav, render } from './nav.js';
import { startSessionSheet, openTimer } from './session.js';
import { bookForm, quoteSheet } from './sheets.js';

let quoteOffset = 0;

VIEWS.today = {
  render() {
    const d = store.get();
    const now = Date.now();
    const today = new Date(now);
    const totals = dailyTotals(d.sessions);
    const todayT = totals.get(dayKey(now)) || { pages: 0, seconds: 0 };
    const goal = d.settings.dailyGoalPages || 0;
    const st = streaks(d.sessions, now);
    const reading = store.readingBooks();
    const a = d.activeSession;
    const q = quoteOfDay(d.quotes, dayKey(now), quoteOffset);

    // Woche Mo–So
    const monday = addDays(new Date(startOfDay(now)), -((today.getDay() + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i);
      const t = totals.get(dayKey(day.getTime()));
      return { day, read: t && (t.pages > 0 || t.seconds >= 60), isToday: dayKey(day.getTime()) === dayKey(now), future: day.getTime() > now };
    });

    const empty = d.books.length === 0;

    return `
    <header class="page-head">
      <div><p class="eyebrow">${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]}</p>
      <h1>${greeting(now)}</h1></div>
      ${moreBtn()}
    </header>

    ${changesCard(d.settings)}

    ${backupDue(d.settings, store.hasContent(), now) ? `
      <button class="banner warn" data-act="goBackup">${icon('shield')}<span><strong>Zeit für ein Backup</strong><small>${d.settings.lastBackup ? 'Letztes Backup am ' + fmtDate(d.settings.lastBackup) : 'Du hast noch kein Backup erstellt'}</small></span>${icon('chevronRight')}</button>` : ''}

    ${a ? (() => {
      const b = store.book(a.bookId);
      return `<button class="banner live" data-act="openTimer">
        <span class="pulse"></span><span><strong>${a.pausedAt ? 'Pausiert' : 'Du liest gerade'}</strong><small>${esc(b ? b.title : '')}</small></span>
        <span class="live-clock" data-live-clock>${fmtClock(a.mode === 'countdown' ? remainingSec(a) : elapsedSec(a))}</span></button>`;
    })() : ''}

    ${empty ? `
      <section class="card hero-empty">
        <div class="hero-art">${icon('books')}</div>
        <h2>Dein Lesejournal</h2>
        <p>Füge dein erstes Buch hinzu – per ISBN-Scan, Cover-Foto oder von Hand.</p>
        <button class="btn primary big" data-act="addBook">${icon('plus')}Buch hinzufügen</button>
      </section>` : ''}

    ${reading.length ? `
      <section>
        <div class="sec-head"><h2>Lese ich gerade</h2>${reading.length > 1 ? `<span class="count">${reading.length}</span>` : ''}</div>
        <div class="${reading.length > 1 ? 'hscroll' : ''}">
        ${reading.map(b => {
          const p = bookProgress(b);
          return `<article class="card reading-card" data-act="openBook" data-id="${b.id}">
            <div class="rc-top">${coverHtml(b, 'm')}
              <div class="rc-info"><h3>${esc(b.title)}</h3><p>${esc(b.author || '')}</p>
                <p class="rc-pages">Seite ${fmtNum(b.currentPage)} von ${fmtNum(b.totalPages)}${b.totalChapters ? ` · Kap. ${fmtNum(b.currentChapter || 0)}/${fmtNum(b.totalChapters)}` : ''}</p></div>
              ${ring(p, { size: 64, stroke: 7, label: Math.round(p * 100) + '<small>%</small>' })}
            </div>
            <button class="btn primary" data-act="startSession" data-id="${b.id}">${icon('play')}Weiterlesen</button>
          </article>`;
        }).join('')}
        </div>
      </section>` : (!empty ? `
      <section class="card soft-empty">
        <p>Gerade liest du kein Buch.</p>
        <button class="btn tonal" data-act="goBooks">${icon('books')}Aus Wunschliste wählen</button>
      </section>` : '')}

    ${!empty ? `
    <section class="card goal-card">
      ${ring(goal ? todayT.pages / goal : 0, { size: 96, stroke: 10, label: fmtNum(todayT.pages), sub: goal ? `von ${goal}` : 'Seiten' })}
      <div class="goal-info">
        <h3>Heute</h3>
        <p>${goal && todayT.pages >= goal ? 'Tagesziel erreicht – stark!' : goal ? `Noch ${fmtNum(Math.max(0, goal - todayT.pages))} Seiten bis zum Tagesziel` : 'Seiten heute'}</p>
        <div class="streak ${st.current ? 'on' : ''}">${icon('flame')}<strong>${st.current}</strong><span>${st.current === 1 ? 'Tag' : 'Tage'} Serie${!st.readToday && st.current ? ' – lies heute, um sie zu halten' : ''}</span></div>
        <div class="week">${week.map(w => `<span class="wd ${w.read ? 'read' : ''} ${w.isToday ? 'today' : ''} ${w.future ? 'future' : ''}"><i></i>${WEEKDAYS_SHORT[w.day.getDay()]}</span>`).join('')}</div>
      </div>
    </section>` : ''}

    ${q ? (() => {
      const qb = store.book(q.bookId);
      return `<section class="card quote-card">
        <div class="qc-head"><span>${icon('sparkle')}Zitat des Tages</span>
          <span class="qc-btns"><button class="round sm glass" data-act="nextQuote" aria-label="Anderes Zitat">${icon('refresh')}</button></span></div>
        <blockquote>${esc(q.text)}</blockquote>
        <p class="qc-src">${esc(quoteSource(q, qb))}</p>
        <button class="link light" data-act="allQuotes">Alle Zitate (${d.quotes.length})${icon('chevronRight')}</button>
      </section>`;
    })() : (!empty ? `
      <section class="card soft-empty">
        <p>Notiere Sätze, die du nicht vergessen willst. Sie tauchen hier und als Erinnerung wieder auf.</p>
        <button class="btn tonal" data-act="newQuote">${icon('quote')}Erstes Zitat notieren</button>
      </section>` : '')}
    `;
  },
};

Object.assign(A, {
  openBook: el => nav.push('book', { id: el.dataset.id }),
  startSession: el => startSessionSheet(el.dataset.id),
  openTimer: () => openTimer(),
  addBook: () => bookForm(),
  newQuote: () => quoteSheet({}),
  nextQuote: () => { quoteOffset++; render(); },
  allQuotes: () => nav.push('quotes', {}),
  goBooks: () => nav.tab('books'),
  goBackup: () => { nav.push('more'); setTimeout(() => document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth' }), 100); },
});

/* ---------- Was ist neu ---------- */

function changesCard(settings) {
  const list = pendingChanges(settings.seenChangesVersion);
  if (!list.length) return '';
  const items = list.flatMap(e => e.items);
  return `<section class="news-card">
    <div class="news-blobs"><i></i><i></i></div>
    <div class="news-head">${icon('sparkle')}<strong>Neu in der App</strong><small>Version ${esc(APP_VERSION)}</small></div>
    <ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <button class="btn news-ok" data-act="changesSeen">${icon('check')}Gelesen</button>
  </section>`;
}

A.changesSeen = () => {
  const el = document.querySelector('.news-card');
  const done = () => store.setSetting('seenChangesVersion', APP_VERSION);
  if (el) { el.classList.add('bye'); setTimeout(done, 280); } else done();
};
