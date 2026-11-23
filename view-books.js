// view-books.js – Bibliothek und alle Zitate
import * as store from './store.js';
import { fmtNum, fmtDate, bookProgress, quoteSource, clubLinkedIds } from './core.js';
import { icon } from './icons.js';
import { esc, A, coverHtml, segmented, starsView, hydratePhotos, moreBtn } from './ui.js';
import { VIEWS, nav, render } from './nav.js';
import { bookForm, quoteSheet } from './sheets.js';

let filter = 'reading';
let search = '';
let quoteFilter = 'all';

const LABELS = { reading: 'Lese ich', want: 'Wunschliste', finished: 'Gelesen', abandoned: 'Abgebrochen' };

VIEWS.books = {
  render(params, onlyResults = false) {
    const d = store.get();
    const counts = { reading: 0, want: 0, finished: 0, abandoned: 0, club: 0 };
    for (const b of d.books) counts[b.status]++;
    // Kategorie „Club“: eigene Bücher mit Club-Bezug (zusätzlich zu ihrer normalen Kategorie)
    const clubIds = clubLinkedIds(d.clubs);
    counts.club = d.books.filter(b => clubIds.has(b.id)).length;
    if (filter === 'club' && !(d.clubs || []).length) filter = 'reading';
    const s = search.trim().toLowerCase();
    let list = filter === 'club' ? d.books.filter(b => clubIds.has(b.id)) : d.books.filter(b => b.status === filter);
    if (s) list = d.books.filter(b => (b.title + ' ' + b.author).toLowerCase().includes(s));
    if (filter === 'finished' && !s) list.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    else if (filter === 'reading' && !s) { const order = store.readingBooks().map(b => b.id); list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
    else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    const opts = [['reading', 'Lese ich'], ['want', 'Wunsch'], ['finished', 'Gelesen']];
    if (counts.abandoned) opts.push(['abandoned', 'Abgebr.']);
    if ((d.clubs || []).length) opts.push(['club', 'Club']);

    const header = `
    <header class="page-head">
      <div><p class="eyebrow">${fmtNum(d.books.length)} ${d.books.length === 1 ? 'Buch' : 'Bücher'}</p><h1>Bücher</h1></div>
      <div class="head-btns"><button class="round accent" data-act="addBook" aria-label="Buch hinzufügen">${icon('plus')}</button>${moreBtn()}</div>
    </header>
    <div class="search">${icon('search')}<input id="book-search" class="input" type="search" placeholder="Titel oder Autor:in suchen" value="${esc(search)}"></div>`;
    const results = `
    ${s ? '' : segmented('bookFilter', opts.map(([v, l]) => [v, `${l} ${counts[v] ? counts[v] : ''}`.trim()]), filter)}
    ${list.length ? `<div class="book-grid">${list.map(b => {
      const p = bookProgress(b);
      return `<button class="book-tile" data-act="openBook" data-id="${b.id}">
        <div class="bt-cover">${coverHtml(b, 'l')}${b.status === 'reading' ? `<span class="bt-bar"><i style="width:${Math.round(p * 100)}%"></i></span>` : ''}</div>
        <strong>${esc(b.title)}</strong>
        <small>${filter === 'club' && !s ? esc(LABELS[b.status] || '') : b.status === 'finished' && b.rating && b.rating.overall ? starsView(b.rating.overall, 'xs') : esc(b.author || '')}</small>
      </button>`;
    }).join('')}</div>` : `
      <div class="empty">${icon(s ? 'search' : 'books')}<p>${s ? 'Nichts gefunden.' : {
        reading: 'Gerade liest du nichts. Beginne ein Buch aus deiner Wunschliste oder füge ein neues hinzu.',
        want: 'Deine Wunschliste ist leer. Hier sammelst du Bücher, die du lesen willst.',
        finished: 'Noch keine Bücher abgeschlossen. Das erste kommt bestimmt!',
        abandoned: 'Keine abgebrochenen Bücher.',
        club: 'Noch keine Bücher mit Club-Bezug. Im Club-Tab kannst du deine Bücher mit Clubbüchern verknüpfen („Lese ich auch“).',
      }[filter]}</p>${s ? '' : `<button class="btn tonal" data-act="addBook">${icon('plus')}Buch hinzufügen</button>`}</div>`}
    `;
    return onlyResults ? results : header + `<div id="book-results">${results}</div>`;
  },
  mount(root) {
    const input = root.querySelector('#book-search');
    input.addEventListener('input', () => {
      search = input.value;
      const box = root.querySelector("#book-results");
      box.innerHTML = VIEWS.books.render({}, true);
      hydratePhotos(box);
    });
    root.addEventListener('segchange', e => { if (e.detail.name === 'bookFilter') { filter = e.detail.value; render(); } });
  },
};

/* ---------- Alle Zitate ---------- */

VIEWS.quotes = {
  render() {
    const d = store.get();
    let list = [...d.quotes].sort((a, b) => b.createdAt - a.createdAt);
    if (quoteFilter === 'fav') list = list.filter(q => q.fav);
    return `
    <header class="page-head sub">
      <button class="back" data-act="back">${icon('chevronLeft')}Zurück</button>
    </header>
    <div class="page-title-row"><h1>Zitate</h1><button class="round accent" data-act="newQuote" aria-label="Zitat notieren">${icon('plus')}</button></div>
    ${segmented('quoteFilter', [['all', `Alle ${d.quotes.length}`], ['fav', `Lieblinge ${d.quotes.filter(q => q.fav).length}`]], quoteFilter)}
    ${list.length ? `<div class="quote-list">${list.map(q => quoteItem(q, true)).join('')}</div>` :
      `<div class="empty">${icon('quote')}<p>${quoteFilter === 'fav' ? 'Markiere Zitate als Lieblingszitat – sie erscheinen öfter.' : 'Noch keine Zitate.'}</p></div>`}
    `;
  },
  mount(root) {
    root.addEventListener('segchange', e => { if (e.detail.name === 'quoteFilter') { quoteFilter = e.detail.value; render(); } });
  },
};

export function quoteItem(q, withBook) {
  const b = store.book(q.bookId);
  return `<button class="quote-item" data-act="editQuote" data-id="${q.id}">
    <blockquote>${esc(q.text)}</blockquote>
    <span class="qi-meta">${q.fav ? icon('heart', 'fav') : ''}${esc(withBook ? quoteSource(q, b) : [q.chapter ? 'Kap. ' + q.chapter : '', q.page ? 'S. ' + q.page : ''].filter(Boolean).join(' · '))}</span>
  </button>`;
}

Object.assign(A, {
  editQuote: el => quoteSheet({ quoteId: el.dataset.id }),
  back: () => nav.back(),
});

export { LABELS };
