// app.js – Start der App
import * as store from './store.js';
import { icon, starIcon } from './icons.js';
import { A } from './ui.js';
import { APP_VERSION } from './core.js';
import { nav, render } from './nav.js';
import { applyTheme } from './theme.js';
import { plusMenu } from './sheets.js';
import { openTimer, resumeTicking } from './session.js';
import './view-today.js';
import './view-books.js';
import './view-book.js';
import './view-stats.js';
import './view-more.js';
import './view-club.js';
import { init as initClub } from './club.js';

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
  tab: el => {
    const from = TAB_ORDER.indexOf(nav.tabName), to = TAB_ORDER.indexOf(el.dataset.tab);
    nav.tab(el.dataset.tab, from < 0 || to < 0 || from === to ? 'fade' : to > from ? 'slide-l' : 'slide-r');
  },
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
    ${t('club', 'club', 'Club')}${t('stats', 'stats', 'Statistik')}`;
}

/* ---------- Wischen zwischen den Tabs ---------- */

const TAB_ORDER = ['today', 'books', 'club', 'stats'];

function enableTabSwipe() {
  let sx = 0, sy = 0, st = 0, ok = false;
  const view = document.getElementById('view');
  view.addEventListener('touchstart', e => {
    ok = false;
    if (e.touches.length !== 1) return;
    if (nav.stackDepth > 0) return; // nur auf den Haupt-Tabs
    if (document.querySelector('.sheet-wrap, .alert-wrap, .timer-screen, .scanner')) return;
    // Nicht in Eingabefeldern oder seitlich scrollenden Bereichen
    if (e.target.closest('input, textarea, select, .hscroll, .heat-scroll, [data-noswipe]')) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now(); ok = true;
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (!ok) return;
    ok = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const i = TAB_ORDER.indexOf(nav.tabName);
    if (i < 0) return;
    const next = TAB_ORDER[i + (dx < 0 ? 1 : -1)];
    if (next) nav.tab(next, dx < 0 ? 'slide-l' : 'slide-r');
  }, { passive: true });
}

/* ---------- Start ---------- */

function boot() {
  const data = store.load();
  // Neu installiert: keine „Was ist neu“-Karte zeigen
  if (!store.hasContent() && !data.settings.seenChangesVersion) data.settings.seenChangesVersion = APP_VERSION;
  applyTheme(data.settings);
  document.getElementById('tabbar').innerHTML = tabbar();
  render({ top: true });
  store.onChange(() => render());
  store.persistStorage();
  initClub();
  enableTabSwipe();
  if (data.activeSession) { resumeTicking(); openTimer(); }
  requestAnimationFrame(() => document.body.classList.add('ready'));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err));
  }
}

boot();
