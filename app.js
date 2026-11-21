// app.js – Start der App
import * as store from './store.js';
import { icon, starIcon } from './icons.js';
import { A } from './ui.js';
import { nav, render } from './nav.js';
import { applyTheme } from './theme.js';
import { plusMenu } from './sheets.js';
import { openTimer, resumeTicking } from './session.js';
import './view-today.js';
import './view-books.js';
import './view-book.js';
import './view-stats.js';
import './view-more.js';

/* ---------- Allgemeine Bedienelemente ---------- */

Object.assign(A, {
  seg(el) {
    const group = el.closest('.seg');
    group.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    group.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: { name: el.dataset.name, value: el.dataset.value } }));
  },
  toggle(el) {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on);
    el.dispatchEvent(new CustomEvent('togglechange', { bubbles: true, detail: { name: el.dataset.name, on } }));
  },
  star(el) {
    const box = el.closest('.stars-input');
    let v = Number(el.dataset.value);
    if (Number(box.dataset.value) === v) v = 0; // nochmal tippen = zurücksetzen
    box.dataset.value = v;
    box.querySelectorAll('.star-slot').forEach((slot, i) => {
      const fill = v >= i + 1 ? 1 : v >= i + 0.5 ? 0.5 : 0;
      slot.querySelector('svg').outerHTML = starIcon(fill);
    });
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    box.dispatchEvent(new CustomEvent('starchange', { bubbles: true, detail: { name: el.dataset.name, value: v } }));
  },
  tab: el => nav.tab(el.dataset.tab),
  plus: () => plusMenu(),
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

/* ---------- Tab-Leiste ---------- */

function tabbar() {
  const t = (id, ic, label) => `<button data-act="tab" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`;
  return `${t('today', 'today', 'Heute')}${t('books', 'books', 'Bücher')}
    <button class="fab" data-act="plus" aria-label="Neu">${icon('plus')}</button>
    ${t('stats', 'stats', 'Statistik')}${t('more', 'more', 'Mehr')}`;
}

/* ---------- Start ---------- */

function boot() {
  const data = store.load();
  applyTheme(data.settings);
  document.getElementById('tabbar').innerHTML = tabbar();
  render({ top: true });
  store.onChange(() => render());
  store.persistStorage();
  if (data.activeSession) { resumeTicking(); openTimer(); }
  requestAnimationFrame(() => document.body.classList.add('ready'));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err));
  }
}

boot();
