// session.js – Lese-Timer (Stoppuhr/Countdown), Fokus-Kurzbefehl, Session beenden
import * as store from './store.js';
import { elapsedSec, remainingSec, fmtClock, fmtDuration, fmtNum, parseNum, maxChapterNumber } from './core.js';
import { icon } from './icons.js';
import { esc, openSheet, closeSheet, sheetHead, segmented, toast, coverHtml, hydratePhotos, runShortcut, confirmDialog } from './ui.js';
import { ring } from './charts.js';
import { render } from './nav.js';

let tick = null;
let overlay = null;
let audioCtx = null;

/* ---------- Ton am Ende des Countdowns ---------- */

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { audioCtx = null; }
}

function chime() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [0, 0.35, 0.7].forEach((d, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = [660, 880, 990][i];
    g.gain.setValueAtTime(0, t0 + d);
    g.gain.linearRampToValueAtTime(0.25, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + d + 0.6);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + d); o.stop(t0 + d + 0.65);
  });
}

/* ---------- Start ---------- */

export function startSessionSheet(bookId = null) {
  const d = store.get();
  if (d.activeSession) { openTimer(); return; }
  const reading = store.readingBooks();
  const wants = d.books.filter(b => b.status === 'want');
  const candidates = [...reading, ...wants];
  if (!candidates.length) { toast('Füge zuerst ein Buch hinzu', { icon: 'info' }); return; }
  let selected = bookId || candidates[0].id;
  let mode = d.settings.timerMode || 'stopwatch';
  let minutes = d.settings.defaultCountdownMin || 30;

  const bookList = () => candidates.map(b => `
    <button class="pick ${b.id === selected ? 'on' : ''}" data-s="book" data-id="${b.id}">
      ${coverHtml(b, 'xs')}
      <span class="pick-txt"><strong>${esc(b.title)}</strong><small>${b.status === 'want' ? 'Wunschliste – wird begonnen' : `Seite ${fmtNum(b.currentPage)} von ${fmtNum(b.totalPages)}`}</small></span>
      <span class="pick-check">${icon('check')}</span>
    </button>`).join('');

  const body = () => `
    ${sheetHead('Lesesession', {})}
    <div class="form">
      <label class="lbl">Buch</label>
      <div class="picks">${bookList()}</div>
      <label class="lbl">Art</label>
      ${segmented('mode', [['stopwatch', 'Stoppuhr'], ['countdown', 'Countdown']], mode)}
      <div class="countdown-opts" ${mode === 'countdown' ? '' : 'hidden'}>
        <div class="chips">${[15, 20, 30, 45, 60, 90].map(m => `<button class="chip ${m === minutes ? 'on' : ''}" data-s="min" data-v="${m}">${m} min</button>`).join('')}</div>
      </div>
      ${d.settings.focusShortcut ? `<p class="note">${icon('focus')}Beim Start öffnet sich kurz der Kurzbefehl „${esc(d.settings.shortcutStart)}“ für den Fokus „Lesen“. Danach oben links auf „Zurück“ tippen.</p>`
        : `<p class="note">${icon('focus')}Tipp: Schalte den Fokus „Lesen“ ein oder richte unter Mehr → Lese-Timer den Kurzbefehl ein.</p>`}
      <button class="btn primary big" data-s="go">${icon('play')}Los geht's</button>
    </div>`;

  openSheet(body(), {
    onMount(root) {
      root.addEventListener('segchange', e => {
        mode = e.detail.value;
        root.querySelector('.countdown-opts').hidden = mode !== 'countdown';
      });
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        if (b.dataset.s === 'book') {
          selected = b.dataset.id;
          root.querySelectorAll('.pick').forEach(p => p.classList.toggle('on', p.dataset.id === selected));
        } else if (b.dataset.s === 'min') {
          minutes = Number(b.dataset.v);
          root.querySelectorAll('[data-s="min"]').forEach(c => c.classList.toggle('on', c === b));
        } else if (b.dataset.s === 'go') {
          unlockAudio();
          const book = store.book(selected);
          store.update(dd => {
            dd.settings.timerMode = mode;
            if (mode === 'countdown') dd.settings.defaultCountdownMin = minutes;
            dd.activeSession = {
              bookId: selected, mode, targetSec: mode === 'countdown' ? minutes * 60 : 0,
              startedAt: Date.now(), pausedAt: null, pausedTotal: 0, fromPage: book.currentPage || 0, alerted: false,
            };
          });
          closeSheet();
          openTimer();
          if (store.get().settings.focusShortcut) {
            setTimeout(() => runShortcut(store.get().settings.shortcutStart, mode === 'countdown' ? String(minutes) : '0'), 450);
          }
        }
      });
      hydratePhotos(root);
    },
  });
}

/* ---------- Timer-Vollbild ---------- */

export function openTimer() {
  const a = store.get().activeSession;
  if (!a) return;
  const book = store.book(a.bookId);
  if (!book) { store.update(d => { d.activeSession = null; }); return; }
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.className = 'timer-screen';
  overlay.innerHTML = `
    <div class="timer-bg"><i></i><i></i><i></i></div>
    <div class="timer-top">
      <button class="round glass" data-t="min" aria-label="Minimieren">${icon('chevronDown')}</button>
      <span class="timer-mode">${a.mode === 'countdown' ? 'Countdown' : 'Stoppuhr'}</span>
      <button class="round glass" data-t="quote" aria-label="Zitat notieren">${icon('quote')}</button>
    </div>
    <div class="timer-book">${coverHtml(book, 's')}<div><strong>${esc(book.title)}</strong><span>ab Seite ${fmtNum(a.fromPage)}</span></div></div>
    <div class="timer-ring"></div>
    <div class="timer-btns">
      <button class="round big glass" data-t="pause" aria-label="Pause"></button>
      <button class="btn primary big" data-t="end">${icon('stop')}Beenden</button>
    </div>`;
  document.body.appendChild(overlay);
  hydratePhotos(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.addEventListener('click', async e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const act = b.dataset.t;
    if (act === 'min') closeTimer();
    else if (act === 'pause') togglePause();
    else if (act === 'end') endSessionSheet();
    else if (act === 'quote') {
      const { quoteSheet } = await import('./sheets.js');
      quoteSheet({ bookId: a.bookId });
    }
  });
  updateTimer(true);
  startTick();
}

export function closeTimer() {
  if (!overlay) return;
  const el = overlay;
  overlay = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 300);
  render();
}

function togglePause() {
  store.update(d => {
    const a = d.activeSession;
    if (!a) return;
    if (a.pausedAt) { a.pausedTotal += Date.now() - a.pausedAt; a.pausedAt = null; }
    else a.pausedAt = Date.now();
  });
  updateTimer(true);
}

function updateTimer(full = false) {
  const a = store.get().activeSession;
  // Banner auf "Heute" aktualisieren
  document.querySelectorAll('[data-live-clock]').forEach(el => {
    el.textContent = a ? fmtClock(a.mode === 'countdown' ? remainingSec(a) : elapsedSec(a)) : '';
  });
  if (!a) return;
  const rem = remainingSec(a);
  if (a.mode === 'countdown' && rem <= 0 && !a.alerted && !a.pausedAt) {
    store.update(d => { d.activeSession.alerted = true; });
    chime();
    toast('Zeit ist um – schön gelesen!', { icon: 'check' });
  }
  if (!overlay) return;
  const el = elapsedSec(a);
  const shown = a.mode === 'countdown' ? rem : el;
  const prog = a.mode === 'countdown' ? 1 - Math.max(0, rem) / a.targetSec : (el % 3600) / 3600;
  const sub = a.pausedAt ? 'pausiert' : a.mode === 'countdown' ? (rem < 0 ? 'Überzeit' : 'verbleibend') : 'gelesen';
  const ringEl = overlay.querySelector('.timer-ring');
  if (full || !ringEl.firstChild) {
    ringEl.innerHTML = ring(prog, { size: 270, stroke: 14, label: `<span class="clock">${fmtClock(shown)}</span>`, sub, cls: a.pausedAt ? 'paused' : '' });
  } else {
    const r = ringEl.querySelector('.ring-val');
    const c = parseFloat(r.style.getPropertyValue('--c'));
    r.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(1, prog))));
    ringEl.querySelector('.clock').textContent = fmtClock(shown);
    ringEl.querySelector('.ring-label span:not(.clock)').textContent = sub;
  }
  overlay.querySelector('[data-t="pause"]').innerHTML = a.pausedAt ? icon('play') : icon('pause');
  overlay.classList.toggle('paused', !!a.pausedAt);
}

function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!store.get().activeSession) { clearInterval(tick); tick = null; return; }
    updateTimer();
  }, 1000);
}

export function resumeTicking() {
  if (store.get().activeSession) startTick();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTimer(true); });

/* ---------- Beenden ---------- */

export function endSessionSheet() {
  const a = store.get().activeSession;
  if (!a) return;
  const book = store.book(a.bookId);
  const secs = Math.round(elapsedSec(a));
  const html = `
    ${sheetHead('Session beenden', { cancel: 'Weiterlesen' })}
    <div class="form">
      <div class="summary-pill">${icon('timer')}<strong>${fmtDuration(secs)}</strong><span>${esc(book.title)}</span></div>
      <div class="row2">
        <div><label class="lbl" for="toPage">Bis Seite</label>
          <input id="toPage" class="input" inputmode="numeric" value="${a.fromPage || ''}" placeholder="${a.fromPage}">
          <small class="hint">vorher Seite ${fmtNum(a.fromPage)}${book.totalPages ? ` von ${fmtNum(book.totalPages)}` : ''}</small></div>
        <div><label class="lbl" for="chap">Kapitel</label>
          <input id="chap" class="input" placeholder="z. B. 7 oder 7–8" value="${book.currentChapter ? esc(String(book.currentChapter)) : ''}"></div>
      </div>
      <label class="lbl" for="note">Worum ging es in diesem Abschnitt?</label>
      <textarea id="note" class="input" rows="5" placeholder="Kurze Notiz: Was ist passiert, was war wichtig, welche Gedanken hattest du?"></textarea>
      <button class="btn primary big" data-s="save">${icon('check')}Speichern</button>
      <button class="btn ghost" data-s="discard">Session verwerfen</button>
    </div>`;
  openSheet(html, {
    tall: true,
    onMount(root, entry) {
      const pageInput = root.querySelector('#toPage');
      pageInput.addEventListener('focus', () => pageInput.select());
      root.addEventListener('click', async e => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        if (b.dataset.s === 'discard') {
          if (await confirmDialog({ title: 'Session verwerfen?', text: 'Die gemessene Zeit wird nicht gespeichert.', ok: 'Verwerfen', danger: true })) {
            finishActive(null);
            closeSheet(entry);
          }
          return;
        }
        const toPage = parseNum(pageInput.value);
        if (isNaN(toPage) || toPage < 0) { pageInput.focus(); toast('Bitte die Seite eintragen', { icon: 'info' }); return; }
        if (book.totalPages && toPage > book.totalPages) { toast(`Das Buch hat nur ${fmtNum(book.totalPages)} Seiten`, { icon: 'info' }); return; }
        const chap = root.querySelector('#chap').value.trim();
        const note = root.querySelector('#note').value.trim();
        const end = a.pausedAt || Date.now();
        finishActive({
          bookId: a.bookId, start: a.startedAt, end, durationSec: secs,
          fromPage: a.fromPage, toPage: Math.max(toPage, a.fromPage), chapter: chap, chapterNum: maxChapterNumber(chap), note,
        });
        closeSheet(entry);
        const pages = Math.max(0, toPage - a.fromPage);
        toast(pages ? `${fmtNum(pages)} Seiten gelesen` : 'Session gespeichert');
        const updated = store.book(a.bookId);
        if (updated && updated.totalPages && updated.currentPage >= updated.totalPages && updated.status === 'reading') {
          setTimeout(async () => {
            if (await confirmDialog({ title: 'Letzte Seite erreicht', text: 'Möchtest du das Buch jetzt abschließen?', ok: 'Abschließen', cancel: 'Später' })) {
              const { finishBookFlow } = await import('./sheets.js');
              finishBookFlow(updated.id);
            }
          }, 500);
        }
      });
    },
  });
}

function finishActive(sessionData) {
  const s = store.get().settings;
  if (sessionData) store.addSession(sessionData);
  store.update(d => { d.activeSession = null; });
  clearInterval(tick); tick = null;
  if (overlay) closeTimer(); else render();
  if (s.focusShortcut && s.focusEndShortcut) setTimeout(() => runShortcut(s.shortcutEnd), 600);
}

