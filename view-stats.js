// view-stats.js – Statistik, Kalender, Jahresrückblick
import * as store from './store.js';
import { fmtNum, fmtDate, fmtDuration, streaks, pagesPerHour, weeklyTotals, monthlyTotals, heatmap, yearGoalStatus, yearReview, sessionPages, totalSeconds, quoteSource, MONTHS, MONTHS_SHORT } from './core.js';
import { icon } from './icons.js';
import { esc, A, coverHtml, starsView, moreBtn } from './ui.js';
import { ring, bars, heatmapSvg } from './charts.js';
import { VIEWS, nav, render } from './nav.js';

let year = new Date().getFullYear();

function years(d) {
  const ys = new Set([new Date().getFullYear()]);
  for (const s of d.sessions) ys.add(new Date(s.end || s.start).getFullYear());
  for (const b of d.books) if (b.finishedAt) ys.add(new Date(b.finishedAt).getFullYear());
  return [...ys].sort((a, b) => b - a);
}

VIEWS.stats = {
  render() {
    const d = store.get();
    const now = Date.now();
    const thisYear = new Date().getFullYear();
    const ys = years(d);
    if (!ys.includes(year)) year = thisYear;
    const ySessions = d.sessions.filter(s => new Date(s.end || s.start).getFullYear() === year);
    const goal = yearGoalStatus(d.books, d.settings.yearGoal, year, year === thisYear ? now : new Date(year, 11, 31, 23).getTime());
    const st = streaks(d.sessions, now);
    const tempo = pagesPerHour(ySessions);
    const pages = ySessions.reduce((a, s) => a + sessionPages(s), 0);
    const secs = totalSeconds(ySessions);
    const weeks = weeklyTotals(d.sessions, 12, now);
    const months = monthlyTotals(d.sessions, d.books, year);
    const hm = heatmap(d.sessions, 22, now);

    let goalText = '';
    if (year === thisYear) {
      if (goal.done >= goal.goal) goalText = 'Jahresziel erreicht!';
      else if (goal.ahead > 0) goalText = `${goal.ahead} ${goal.ahead === 1 ? 'Buch' : 'Bücher'} vor dem Plan`;
      else if (goal.ahead < 0) goalText = `${-goal.ahead} ${goal.ahead === -1 ? 'Buch' : 'Bücher'} hinter dem Plan`;
      else goalText = 'Genau im Plan';
    } else goalText = goal.done >= goal.goal ? 'Ziel erreicht' : `Ziel: ${goal.goal}`;

    return `
    <header class="page-head">
      <div><p class="eyebrow">Dein Lesen in Zahlen</p><h1>Statistik</h1></div>
      ${moreBtn()}
    </header>
    ${ys.length > 1 ? `<div class="chips year-chips">${ys.map(y => `<button class="chip ${y === year ? 'on' : ''}" data-act="setYear" data-y="${y}">${y}</button>`).join('')}</div>` : ''}

    <section class="card goal-year">
      ${ring(goal.progress, { size: 120, stroke: 12, label: fmtNum(goal.done), sub: `von ${fmtNum(goal.goal)}` })}
      <div>
        <h3>Jahresziel ${year}</h3>
        <p>${goalText}</p>
        <button class="link" data-act="editGoals">Ziel ändern${icon('chevronRight')}</button>
      </div>
    </section>

    <section class="kpis">
      <div class="kpi"><span class="kpi-ic">${icon('book')}</span><strong>${fmtNum(pages)}</strong><small>Seiten ${year}</small></div>
      <div class="kpi"><span class="kpi-ic">${icon('timer')}</span><strong>${secs ? fmtDuration(secs) : '–'}</strong><small>Lesezeit</small></div>
      <div class="kpi"><span class="kpi-ic">${icon('speed')}</span><strong>${tempo ? fmtNum(tempo) : '–'}</strong><small>Seiten pro Stunde</small></div>
      <div class="kpi"><span class="kpi-ic">${icon('flame')}</span><strong>${st.current} <em>/ ${st.longest}</em></strong><small>Serie / Rekord (Tage)</small></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Lesekalender</h3><small>letzte 22 Wochen</small></div>
      ${heatmapSvg(hm)}
    </section>

    <section class="card">
      <div class="card-head"><h3>Seiten pro Woche</h3><small>letzte 12 Wochen</small></div>
      ${bars(weeks.map((w, i) => ({
        label: i % 3 === 2 || i === weeks.length - 1 ? `${new Date(w.start).getDate()}.${new Date(w.start).getMonth() + 1}.` : '',
        value: w.pages,
        tip: `Woche ab ${fmtDate(w.start, { year: false })}: ${fmtNum(w.pages)} Seiten${w.seconds ? ' · ' + fmtDuration(w.seconds) : ''}`,
      })))}
    </section>

    <section class="card">
      <div class="card-head"><h3>Seiten pro Monat</h3><small>${year}</small></div>
      ${bars(months.map(m => ({
        label: MONTHS_SHORT[m.month].slice(0, 1),
        value: m.pages,
        tip: `${MONTHS[m.month]}: ${fmtNum(m.pages)} Seiten · ${m.books} ${m.books === 1 ? 'Buch' : 'Bücher'} beendet`,
      })), { highlightLast: false })}
    </section>

    <button class="card review-teaser" data-act="openReview">
      <span class="rt-ic">${icon('sparkle')}</span>
      <span><strong>Jahresrückblick ${year}</strong><small>Deine Highlights auf einen Blick</small></span>
      ${icon('chevronRight')}
    </button>
    `;
  },
};

/* ---------- Jahresrückblick ---------- */

VIEWS.review = {
  render({ y }) {
    const d = store.get();
    const r = yearReview(d, y);
    const qb = r.quote ? store.book(r.quote.bookId) : null;
    return `
    <header class="page-head sub">
      <button class="back" data-act="back">${icon('chevronLeft')}Zurück</button>
    </header>
    <section class="review-hero">
      <div class="rh-blobs"><i></i><i></i><i></i></div>
      <p>Dein Lesejahr</p>
      <h1>${y}</h1>
      <div class="rh-big"><strong>${fmtNum(r.booksFinished)}</strong><span>${r.booksFinished === 1 ? 'Buch gelesen' : 'Bücher gelesen'}</span></div>
    </section>
    <section class="kpis">
      <div class="kpi"><span class="kpi-ic">${icon('book')}</span><strong>${fmtNum(r.pages)}</strong><small>Seiten</small></div>
      <div class="kpi"><span class="kpi-ic">${icon('timer')}</span><strong>${r.seconds ? fmtDuration(r.seconds) : '–'}</strong><small>Lesezeit</small></div>
      <div class="kpi"><span class="kpi-ic">${icon('calendar')}</span><strong>${fmtNum(r.readingDays)}</strong><small>Lesetage</small></div>
      <div class="kpi"><span class="kpi-ic">${icon('flame')}</span><strong>${fmtNum(r.longestStreak)}</strong><small>längste Serie</small></div>
    </section>
    ${r.top.length ? `<section>
      <div class="sec-head"><h2>Deine Top ${r.top.length}</h2></div>
      <div class="card top-list">${r.top.map((b, i) => `
        <button class="top-item" data-act="openBook" data-id="${b.id}"><span class="rank">${i + 1}</span>${coverHtml(b, 'xs')}
          <span class="ti-txt"><strong>${esc(b.title)}</strong><small>${esc(b.author || '')}</small>${starsView(b.rating.overall, 'xs')}</span></button>`).join('')}</div>
    </section>` : ''}
    <section class="facts">
      ${r.bestMonth ? `<div class="card fact"><span>${icon('trophy')}</span><p>Stärkster Monat war der <strong>${MONTHS[r.bestMonth.month]}</strong> mit ${fmtNum(r.bestMonth.pages)} Seiten.</p></div>` : ''}
      ${r.longest ? `<div class="card fact"><span>${icon('layers')}</span><p>Dein dickstes Buch: <strong>${esc(r.longest.title)}</strong> mit ${fmtNum(r.longest.totalPages)} Seiten.</p></div>` : ''}
      ${r.topAuthor ? `<div class="card fact"><span>${icon('pen')}</span><p>Am häufigsten gelesen: <strong>${esc(r.topAuthor.name)}</strong> (${r.topAuthor.count} Bücher).</p></div>` : ''}
      ${r.tempo ? `<div class="card fact"><span>${icon('speed')}</span><p>Dein Tempo: <strong>${fmtNum(r.tempo)} Seiten</strong> pro Stunde.</p></div>` : ''}
      ${r.quotesCount ? `<div class="card fact"><span>${icon('quote')}</span><p>Du hast <strong>${fmtNum(r.quotesCount)} ${r.quotesCount === 1 ? 'Zitat' : 'Zitate'}</strong> gesammelt.</p></div>` : ''}
    </section>
    ${r.quote ? `<section class="card quote-card"><div class="qc-head"><span>${icon('heart')}Zitat des Jahres</span></div>
      <blockquote>${esc(r.quote.text)}</blockquote><p class="qc-src">${esc(quoteSource(r.quote, qb))}</p></section>` : ''}
    ${!r.booksFinished && !r.pages ? `<div class="empty">${icon('sparkle')}<p>Für ${y} gibt es noch keine Lesedaten.</p></div>` : ''}
    `;
  },
};

Object.assign(A, {
  setYear: el => { year = Number(el.dataset.y); render(); },
  openReview: () => nav.push('review', { y: year }),
  editGoals: () => { nav.push('more'); setTimeout(() => document.getElementById('goals')?.scrollIntoView({ behavior: 'smooth' }), 100); },
});
