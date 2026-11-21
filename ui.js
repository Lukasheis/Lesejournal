// ui.js – gemeinsame Bausteine: Escaping, Aktionen, Bottom-Sheets, Hinweise, Sterne, Cover
import { icon, starIcon } from './icons.js';
import { photoUrl } from './store.js';

/** Registry für data-act="name" Klicks */
export const A = {};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Bottom-Sheet ---------- */

const sheetStack = [];

export function openSheet(html, { onMount, onClose, tall = false, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div>
    <div class="sheet ${tall ? 'tall' : ''} ${cls}" role="dialog" aria-modal="true">
      <div class="sheet-grab" data-sheet-drag><span></span></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  document.body.appendChild(wrap);
  const sheet = wrap.querySelector('.sheet');
  const entry = { wrap, sheet, onClose };
  sheetStack.push(entry);
  requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.addEventListener('click', e => { if (e.target.closest('[data-sheet-close]')) closeSheet(entry); });
  enableDrag(entry);
  if (onMount) onMount(sheet.querySelector('.sheet-body'), entry);
  return entry;
}

export function closeSheet(entry = sheetStack[sheetStack.length - 1], result) {
  if (!entry) return;
  const i = sheetStack.indexOf(entry);
  if (i >= 0) sheetStack.splice(i, 1);
  entry.wrap.classList.remove('open');
  entry.wrap.classList.add('closing');
  setTimeout(() => entry.wrap.remove(), 320);
  if (entry.onClose) entry.onClose(result);
}

export function closeAllSheets() { while (sheetStack.length) closeSheet(); }

export function topSheet() { return sheetStack[sheetStack.length - 1] || null; }

function enableDrag(entry) {
  const { sheet } = entry;
  const grab = sheet.querySelector('[data-sheet-drag]');
  let startY = 0, dy = 0, dragging = false;
  grab.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dragging = true; sheet.style.transition = 'none'; }, { passive: true });
  grab.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  grab.addEventListener('touchend', () => {
    dragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) closeSheet(entry);
    dy = 0;
  });
}

/** Sheet-Kopf mit Titel und Schließen/Fertig */
export function sheetHead(title, { action = null, actionLabel = 'Fertig', cancel = 'Abbrechen' } = {}) {
  return `<div class="sheet-head">
    <button class="link" data-sheet-close>${esc(cancel)}</button>
    <h2>${esc(title)}</h2>
    ${action ? `<button class="link strong" data-act="${action}">${esc(actionLabel)}</button>` : '<span class="spacer"></span>'}
  </div>`;
}

/* ---------- Hinweise & Dialoge ---------- */

let toastTimer = null;
export function toast(msg, { icon: ic = 'check' } = {}) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`;
  el.classList.toggle('long', String(msg).length > 38);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), String(msg).length > 38 ? 4500 : 2400);
}

export function confirmDialog({ title, text = '', ok = 'OK', cancel = 'Abbrechen', danger = false }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    wrap.innerHTML = `<div class="alert" role="alertdialog">
      <h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="alert-btns"><button data-r="0">${esc(cancel)}</button><button data-r="1" class="${danger ? 'danger' : 'strong'}">${esc(ok)}</button></div>
    </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 200);
      resolve(b.dataset.r === '1');
    });
  });
}

/* ---------- Formular-Bausteine ---------- */

export function segmented(name, options, value, act = 'seg') {
  return `<div class="seg" role="tablist" data-name="${esc(name)}">${options.map(([v, label]) =>
    `<button role="tab" class="${String(v) === String(value) ? 'on' : ''}" data-act="${act}" data-name="${esc(name)}" data-value="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;
}

export function toggle(name, on, act = 'toggle') {
  return `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-act="${act}" data-name="${esc(name)}"><span></span></button>`;
}

/** Sterne-Anzeige (0–5 in halben Schritten) */
export function starsView(value, cls = '') {
  let out = '';
  for (let i = 1; i <= 5; i++) out += starIcon(value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0);
  return `<span class="stars ${cls}" aria-label="${String(value).replace('.', ',')} von 5 Sternen">${out}</span>`;
}

/** Sterne-Eingabe: jede Hälfte ist eine Tippfläche */
export function starsInput(name, value = 0, big = false) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="star-slot">${starIcon(value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0)}
      <button aria-label="${i - 0.5} Sterne" data-act="star" data-name="${name}" data-value="${i - 0.5}"></button>
      <button aria-label="${i} Sterne" data-act="star" data-name="${name}" data-value="${i}"></button></span>`;
  }
  return `<div class="stars-input ${big ? 'big' : ''}" data-stars="${name}" data-value="${value}">${out}</div>`;
}

/* ---------- Cover ---------- */

export function coverHtml(book, size = 'm') {
  const initials = esc((book.title || '?').trim().slice(0, 40));
  const hue = [...(book.title || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 3 + 1;
  if (book.coverId) {
    return `<div class="cover cover-${size}"><img alt="" data-photo="${esc(book.coverId)}"></div>`;
  }
  return `<div class="cover cover-${size} cover-gen g${hue}"><span class="cover-title">${initials}</span>${book.author ? `<span class="cover-author">${esc(book.author)}</span>` : ''}</div>`;
}

/** Bilder mit data-photo aus IndexedDB nachladen */
export async function hydratePhotos(root) {
  for (const img of $$('img[data-photo]', root)) {
    if (img.src) continue;
    const url = await photoUrl(img.dataset.photo);
    if (url) { img.src = url; img.onload = () => img.classList.add('loaded'); }
  }
}

/* ---------- Konfetti ---------- */

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const colors = ['--c1', '--c2', '--c3'].map(v => cs.getPropertyValue(v).trim()).concat(['#ffffff']);
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 6,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let t = 0;
  (function frame() {
    t++;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / 150);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t < 150) requestAnimationFrame(frame); else canvas.remove();
  })();
}

/* ---------- Teilen / Herunterladen ---------- */

export async function shareOrDownload(file, title) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** Datei auswählen (Promise) */
export function pickFile(accept, { capture = null } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

/** Fokus-Kurzbefehl öffnen */
export function runShortcut(name, text = '') {
  const url = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}${text !== '' ? `&input=text&text=${encodeURIComponent(text)}` : ''}`;
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a); a.click(); a.remove();
}

/** Zahnrad oben rechts → Einstellungen („Mehr“) */
export function moreBtn() {
  return `<button class="round" data-act="openMore" aria-label="Einstellungen">${icon('settings')}</button>`;
}
