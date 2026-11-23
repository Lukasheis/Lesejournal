// sheets.js – Eingabedialoge: Plus-Menü, Buch, Zitat, Seiten nachtragen, Buch abschließen
import * as store from './store.js';
import { parseNum, fmtNum, fmtDate, fmtDuration, dayKey, maxChapterNumber, normalizeIsbn, fmtIsbn, RATING_CATEGORIES, keepTime } from './core.js';
import { icon } from './icons.js';
import { esc, openSheet, closeSheet, sheetHead, segmented, toggle, starsInput, toast, confirmDialog, pickFile, coverHtml, hydratePhotos, confetti } from './ui.js';
import { scanIsbn, ocrCover, ocrText } from './scan.js';
import { startSessionSheet } from './session.js';
import { nav } from './nav.js';

/* ---------- Plus-Menü ---------- */

export function plusMenu() {
  const d = store.get();
  const hasBooks = d.books.length > 0;
  const items = [
    ['session', 'timer', 'Lesesession starten', 'Timer mit Fokus'],
    ['book', 'barcode', 'Buch hinzufügen', 'Scannen oder eintippen'],
    ['quote', 'quote', 'Zitat notieren', 'Mit Seite und Kapitel'],
    ['log', 'pen', 'Seiten nachtragen', 'Ohne Timer gelesen'],
  ];
  openSheet(`
    <h2 class="sheet-title">Neu</h2>
    <div class="plus-grid">${items.map(([k, ic, t, s]) => `
      <button class="plus-item ${!hasBooks && k !== 'book' ? 'dim' : ''}" data-s="${k}">
        <span class="plus-ic">${icon(ic)}</span><strong>${t}</strong><small>${s}</small></button>`).join('')}
    </div>`, {
    onMount(root, entry) {
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        closeSheet(entry);
        const k = b.dataset.s;
        if (k !== 'book' && !hasBooks) { setTimeout(() => bookForm(), 200); toast('Füge zuerst ein Buch hinzu', { icon: 'info' }); return; }
        setTimeout(() => {
          if (k === 'session') startSessionSheet();
          else if (k === 'book') bookForm();
          else if (k === 'quote') quoteSheet({});
          else if (k === 'log') logSheet();
        }, 200);
      });
    },
  });
}

/* ---------- Buch hinzufügen / bearbeiten ---------- */

export function bookForm(bookId = null, preset = {}) {
  const existing = bookId ? store.book(bookId) : null;
  const b = existing ? { ...existing } : { title: '', author: '', isbn: '', totalPages: '', totalChapters: '', currentPage: '', status: 'reading', blurb: '', ...preset };
  const newPhotos = { cover: null, back: null }; // Blobs, die beim Speichern geschrieben werden
  const removed = { cover: false, back: false };

  const photoSlot = (kind, label) => {
    const id = kind === 'cover' ? b.coverId : b.backId;
    return `<button class="photo-slot" data-s="photo" data-kind="${kind}">
      ${id ? `<img data-photo="${esc(id)}" alt="">` : `<span class="ps-empty">${icon('camera')}<small>${label}</small></span>`}
    </button>`;
  };

  const html = `
    ${sheetHead(existing ? 'Buch bearbeiten' : 'Buch hinzufügen', { action: 'bookSave', actionLabel: 'Sichern' })}
    <div class="form">
      <div class="photo-row">
        ${photoSlot('cover', 'Cover')}
        ${photoSlot('back', 'Rückseite')}
        <div class="photo-actions">
          <button class="btn tonal" data-s="scan">${icon('barcode')}ISBN scannen</button>
          <p class="hint">Fotos werden am iPhone gelesen: Titel und Autor vom Cover, Klappentext von der Rückseite.</p>
        </div>
      </div>
      <div class="ocr-status" hidden></div>
      <div class="ocr-lines" hidden></div>
      <label class="lbl" for="f-title">Titel</label>
      <input id="f-title" class="input" value="${esc(b.title)}" placeholder="Buchtitel" autocomplete="off">
      <label class="lbl" for="f-author">Autor:in</label>
      <input id="f-author" class="input" value="${esc(b.author)}" placeholder="Vorname Nachname" autocomplete="off">
      <div class="row2">
        <div><label class="lbl" for="f-pages">Seiten</label><input id="f-pages" class="input" inputmode="numeric" value="${b.totalPages || ''}" placeholder="z. B. 320"></div>
        <div><label class="lbl" for="f-chapters">Kapitel <small>(optional)</small></label><input id="f-chapters" class="input" inputmode="numeric" value="${b.totalChapters || ''}" placeholder="z. B. 24"></div>
      </div>
      ${existing ? `
        <div class="row2">
          <div><label class="lbl" for="f-current">Aktuelle Seite</label><input id="f-current" class="input" inputmode="numeric" value="${b.currentPage || ''}" placeholder="0"></div>
          <div><label class="lbl" for="f-isbn">ISBN</label><input id="f-isbn" class="input" inputmode="numeric" value="${esc(b.isbn ? fmtIsbn(b.isbn) : '')}" placeholder="978-…"></div>
        </div>` : `
        <label class="lbl">Status</label>
        ${segmented('status', [['reading', 'Lese ich'], ['want', 'Wunschliste'], ['finished', 'Gelesen']], b.status)}
        <div class="row2">
          <div class="cur-wrap"><label class="lbl" for="f-current">Bin auf Seite</label><input id="f-current" class="input" inputmode="numeric" value="${b.currentPage || ''}" placeholder="0"></div>
          <div><label class="lbl" for="f-isbn">ISBN</label><input id="f-isbn" class="input" inputmode="numeric" value="${esc(b.isbn ? fmtIsbn(b.isbn) : '')}" placeholder="978-…"></div>
        </div>`}
      <div class="row2 dates-row">
        <div class="start-wrap" ${b.status === 'want' ? 'hidden' : ''}><label class="lbl" for="f-start">Begonnen am</label>
          <input id="f-start" type="date" class="input" value="${b.startedAt ? dayKey(b.startedAt) : (existing ? '' : dayKey(Date.now()))}" max="${dayKey(Date.now())}"></div>
        <div class="end-wrap" ${existing && (b.status === 'finished' || b.status === 'abandoned') ? '' : 'hidden'}><label class="lbl" for="f-end">${b.status === 'abandoned' ? 'Abgebrochen am' : 'Beendet am'}</label>
          <input id="f-end" type="date" class="input" value="${b.finishedAt ? dayKey(b.finishedAt) : ''}" max="${dayKey(Date.now())}"></div>
      </div>
      <label class="lbl" for="f-blurb">Klappentext <small>(optional)</small></label>
      <textarea id="f-blurb" class="input" rows="4" placeholder="Worum geht es?">${esc(b.blurb)}</textarea>
      ${existing ? `<button class="btn ghost danger" data-s="delete">${icon('trash')}Buch löschen</button>` : ''}
    </div>`;

  openSheet(html, {
    tall: true,
    onMount(root, entry) {
      hydratePhotos(root);
      const $ = s => root.querySelector(s);
      let status = b.status;
      let lastField = $('#f-title');
      $('#f-title').addEventListener('focus', () => { lastField = $('#f-title'); });
      $('#f-author').addEventListener('focus', () => { lastField = $('#f-author'); });
      const curWrap = root.querySelector('.cur-wrap');
      root.addEventListener('segchange', e => {
        status = e.detail.value;
        if (curWrap) curWrap.style.visibility = status === 'reading' ? '' : 'hidden';
        $('.start-wrap').hidden = status === 'want';
      });
      const ocrStatus = $('.ocr-status');
      const showStatus = t => { ocrStatus.hidden = !t; ocrStatus.innerHTML = t ? `<span class="spinner"></span>${esc(t)}` : ''; };

      root.addEventListener('click', async e => {
        const btn = e.target.closest('[data-s], [data-act="bookSave"], [data-line]');
        if (!btn) return;
        if (btn.dataset.line != null) {
          lastField.value = btn.dataset.line;
          btn.classList.add('used');
          return;
        }
        const s = btn.dataset.s;
        if (btn.dataset.act === 'bookSave') return save();
        if (s === 'scan') {
          const isbn = await scanIsbn().catch(err => { toast(err.message, { icon: 'info' }); return null; });
          if (isbn) {
            $('#f-isbn').value = fmtIsbn(isbn);
            const dup = store.get().books.find(x => x.isbn === isbn && x.id !== bookId);
            toast(dup ? `Achtung: „${dup.title}“ hat dieselbe ISBN` : 'ISBN erkannt', { icon: dup ? 'info' : 'check' });
          }
        } else if (s === 'photo') {
          const kind = btn.dataset.kind;
          const file = await pickFile('image/*');
          if (!file) return;
          const blob = await store.resizeImage(file, kind === 'cover' ? 900 : 1400);
          newPhotos[kind] = blob;
          removed[kind] = false;
          btn.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="" class="loaded">`;
          try {
            if (kind === 'cover') {
              showStatus('Lese Titel vom Cover …');
              const res = await ocrCover(file, showStatus);
              if (!$('#f-title').value.trim() && res.title) $('#f-title').value = res.title;
              if (!$('#f-author').value.trim() && res.author) $('#f-author').value = res.author;
              const lines = $('.ocr-lines');
              if (res.lines.length) {
                lines.hidden = false;
                lines.innerHTML = `<p class="hint">Erkannte Zeilen – tippe zuerst ins Feld Titel oder Autor:in, dann auf eine Zeile:</p>
                  <div class="chips">${res.lines.slice(0, 12).map(l => `<button class="chip" data-line="${esc(l)}">${esc(l)}</button>`).join('')}</div>`;
              }
            } else {
              showStatus('Lese Klappentext …');
              const text = await ocrText(file, showStatus);
              const blurb = $('#f-blurb');
              if (text && (!blurb.value.trim() || await confirmDialog({ title: 'Klappentext ersetzen?', text: 'Der erkannte Text ersetzt den vorhandenen.', ok: 'Ersetzen' }))) blurb.value = text;
            }
          } catch (err) {
            toast(err.message || 'Texterkennung fehlgeschlagen', { icon: 'info' });
          } finally { showStatus(''); }
        } else if (s === 'delete') {
          if (await confirmDialog({ title: `„${existing.title}“ löschen?`, text: 'Alle Sessions, Notizen und Zitate dieses Buchs werden ebenfalls gelöscht.', ok: 'Löschen', danger: true })) {
            await store.deleteBook(bookId);
            closeSheet(entry);
            nav.resetTo('books');
            toast('Buch gelöscht', { icon: 'trash' });
          }
        }
      });

      async function save() {
        const title = $('#f-title').value.trim();
        if (!title) { $('#f-title').focus(); toast('Bitte einen Titel eingeben', { icon: 'info' }); return; }
        const total = parseNum($('#f-pages').value);
        const chapters = parseNum($('#f-chapters').value);
        const current = parseNum($('#f-current') ? $('#f-current').value : '');
        const isbnRaw = $('#f-isbn').value.trim();
        const isbn = isbnRaw ? normalizeIsbn(isbnRaw) : '';
        if (isbnRaw && !isbn) { toast('Die ISBN ist ungültig', { icon: 'info' }); $('#f-isbn').focus(); return; }
        if (status === 'reading' && !(total > 0)) { $('#f-pages').focus(); toast('Bitte die Seitenzahl eintragen', { icon: 'info' }); return; }
        if (total > 0 && current > total) { toast('Aktuelle Seite ist größer als die Seitenzahl', { icon: 'info' }); return; }
        const fields = {
          title, author: $('#f-author').value.trim(), isbn: isbn || '',
          totalPages: total > 0 ? total : 0, totalChapters: chapters > 0 ? chapters : 0,
          blurb: $('#f-blurb').value.trim(),
        };
        if (!isNaN(current)) fields.currentPage = current;
        // Beginn und Ende frei wählbar (gleicher Tag = Uhrzeit behalten)
        const startKey = $('.start-wrap').hidden ? '' : $('#f-start').value;
        const endKey = $('.end-wrap').hidden ? '' : $('#f-end').value;
        if (startKey && endKey && endKey < startKey) { toast('Das Ende liegt vor dem Beginn', { icon: 'info' }); return; }
        if (!$('.start-wrap').hidden) fields.startedAt = startKey ? keepTime(startKey, existing && existing.startedAt) : null;
        if (!$('.end-wrap').hidden && endKey) fields.finishedAt = keepTime(endKey, existing && existing.finishedAt);
        for (const kind of ['cover', 'back']) {
          if (newPhotos[kind]) {
            const key = kind === 'cover' ? 'coverId' : 'backId';
            if (existing && existing[key]) await store.deletePhoto(existing[key]);
            fields[key] = await store.putPhoto(newPhotos[kind]);
          }
        }
        if (existing) {
          store.updateBook(bookId, fields);
          closeSheet(entry);
          toast('Gespeichert');
        } else {
          fields.status = status;
          const nb = store.addBook(fields);
          closeSheet(entry);
          toast(status === 'want' ? 'Auf die Wunschliste gesetzt' : 'Buch hinzugefügt');
          if (status === 'finished') setTimeout(() => finishBookFlow(nb.id, { already: true }), 350);
          else nav.push('book', { id: nb.id });
        }
      }
    },
  });
}

/* ---------- Zitat ---------- */

function bookSelect(id, selected, filter = () => true) {
  const books = store.get().books.filter(filter);
  const order = { reading: 0, finished: 1, want: 2, abandoned: 3 };
  books.sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title, 'de'));
  return `<select id="${id}" class="input">${books.map(b => `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${esc(b.title)}${b.author ? ' – ' + esc(b.author) : ''}</option>`).join('')}</select>`;
}

export function quoteSheet({ bookId = null, quoteId = null, title = null, onSaved = null }) {
  const q = quoteId ? store.get().quotes.find(x => x.id === quoteId) : null;
  const d = store.get();
  const active = d.activeSession;
  const selected = q ? q.bookId : bookId || (active && active.bookId) || (store.readingBooks()[0] || d.books[0] || {}).id;
  const sel = store.book(selected);
  let fav = q ? !!q.fav : false;
  const html = `
    ${sheetHead(title || (q ? 'Zitat bearbeiten' : 'Zitat notieren'), { action: 'quoteSave', actionLabel: 'Sichern' })}
    <div class="form">
      <label class="lbl" for="q-book">Buch</label>
      ${bookSelect('q-book', selected)}
      <div class="lbl-row"><label class="lbl" for="q-text">Zitat</label>
        <button class="link small" data-s="dictate">${icon('mic')}Diktieren</button></div>
      <div class="dictate-hint" hidden>${icon('mic')}<span>Tippe unten auf der Tastatur auf das <b>Mikrofon</b> und sprich das Zitat. Satzzeichen setzt das iPhone meist selbst, sonst sag „Komma“ oder „Punkt“. Zum Beenden nochmal auf das Mikrofon tippen.</span></div>
      <textarea id="q-text" class="input quote-input" rows="6" placeholder="Der Satz, den du nicht vergessen willst …">${esc(q ? q.text : '')}</textarea>
      <div class="row2">
        <div><label class="lbl" for="q-page">Seite</label><input id="q-page" class="input" inputmode="numeric" value="${q && q.page ? q.page : (sel && sel.currentPage) || ''}"></div>
        <div><label class="lbl" for="q-chap">Kapitel</label><input id="q-chap" class="input" value="${esc(q ? q.chapter : (sel && sel.currentChapter) || '')}"></div>
      </div>
      <div class="list-row"><span>${icon('heart')}Lieblingszitat <small>erscheint öfter</small></span>${toggle('fav', fav)}</div>
      ${q ? `<button class="btn ghost danger" data-s="delete">${icon('trash')}Zitat löschen</button>` : ''}
    </div>`;
  openSheet(html, {
    tall: true,
    onMount(root, entry) {
      const $ = s => root.querySelector(s);
      root.addEventListener('togglechange', e => { fav = e.detail.on; });
      root.addEventListener('click', async e => {
        const btn = e.target.closest('[data-s], [data-act="quoteSave"]');
        if (!btn) return;
        if (btn.dataset.s === 'dictate') {
          // Diktieren über das Mikrofon der iPhone-Tastatur: Textfeld öffnen und Hinweis zeigen
          $('.dictate-hint').hidden = false;
          const ta = $('#q-text');
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
          return;
        }
        if (btn.dataset.s === 'delete') {
          if (await confirmDialog({ title: 'Zitat löschen?', ok: 'Löschen', danger: true })) {
            store.deleteQuote(q.id); closeSheet(entry); toast('Zitat gelöscht', { icon: 'trash' });
          }
          return;
        }
        const text = $('#q-text').value.trim();
        if (!text) { $('#q-text').focus(); toast('Bitte das Zitat eingeben', { icon: 'info' }); return; }
        const page = parseNum($('#q-page').value);
        const fields = { bookId: $('#q-book').value, text, page: isNaN(page) ? null : page, chapter: $('#q-chap').value.trim(), fav };
        const saved = q ? (store.updateQuote(q.id, fields), { ...q, ...fields }) : store.addQuote(fields);
        if (onSaved) onSaved(saved);
        closeSheet(entry);
        toast(q ? 'Zitat gespeichert' : 'Zitat notiert', { icon: 'quote' });
      });
    },
  });
}

/* ---------- Seiten nachtragen ---------- */

export function logSheet(bookId = null) {
  const reading = store.readingBooks();
  const selected = bookId || (reading[0] || store.get().books[0]).id;
  const html = `
    ${sheetHead('Seiten nachtragen', { action: 'logSave', actionLabel: 'Sichern' })}
    <div class="form">
      <label class="lbl" for="l-book">Buch</label>
      ${bookSelect('l-book', selected, b => b.status === 'reading' || b.status === 'want' || b.id === bookId)}
      <div class="row2">
        <div><label class="lbl" for="l-to">Bis Seite</label><input id="l-to" class="input" inputmode="numeric"></div>
        <div><label class="lbl" for="l-min">Minuten <small>(optional)</small></label><input id="l-min" class="input" inputmode="numeric" placeholder="z. B. 25"></div>
      </div>
      <small class="hint" id="l-from"></small>
      <div class="row2">
        <div><label class="lbl" for="l-date">Datum</label><input id="l-date" type="date" class="input" value="${dayKey(Date.now())}" max="${dayKey(Date.now())}"></div>
        <div><label class="lbl" for="l-chap">Kapitel</label><input id="l-chap" class="input" placeholder="z. B. 7–8"></div>
      </div>
      <label class="lbl" for="l-note">Worum ging es?</label>
      <textarea id="l-note" class="input" rows="4" placeholder="Kurze Notiz zum Abschnitt"></textarea>
    </div>`;
  openSheet(html, {
    tall: true,
    onMount(root, entry) {
      const $ = s => root.querySelector(s);
      const updFrom = () => {
        const b = store.book($('#l-book').value);
        $('#l-from').textContent = b ? `Aktuell Seite ${fmtNum(b.currentPage)}${b.totalPages ? ` von ${fmtNum(b.totalPages)}` : ''}` : '';
        $('#l-to').placeholder = b ? String((b.currentPage || 0) + 20) : '';
      };
      updFrom();
      $('#l-book').addEventListener('change', updFrom);
      root.addEventListener('click', e => {
        if (!e.target.closest('[data-act="logSave"]')) return;
        const b = store.book($('#l-book').value);
        const to = parseNum($('#l-to').value);
        if (isNaN(to) || to <= (b.currentPage || 0)) { $('#l-to').focus(); toast(`Bitte eine Seite größer als ${fmtNum(b.currentPage)} eingeben`, { icon: 'info' }); return; }
        if (b.totalPages && to > b.totalPages) { toast(`Das Buch hat nur ${fmtNum(b.totalPages)} Seiten`, { icon: 'info' }); return; }
        const min = parseNum($('#l-min').value);
        const [y, m, dd] = $('#l-date').value.split('-').map(Number);
        const isToday = $('#l-date').value === dayKey(Date.now());
        const end = isToday ? Date.now() : new Date(y, m - 1, dd, 20, 0).getTime();
        const secs = !isNaN(min) && min > 0 ? Math.round(min * 60) : 0;
        const chap = $('#l-chap').value.trim();
        store.addSession({
          bookId: b.id, start: end - secs * 1000, end, durationSec: secs, manual: true,
          fromPage: b.currentPage || 0, toPage: to, chapter: chap, chapterNum: maxChapterNumber(chap), note: $('#l-note').value.trim(),
        });
        closeSheet(entry);
        toast(`${fmtNum(to - (b.currentPage || 0))} Seiten eingetragen`);
        const nb = store.book(b.id);
        if (nb.totalPages && nb.currentPage >= nb.totalPages) setTimeout(async () => {
          if (await confirmDialog({ title: 'Letzte Seite erreicht', text: 'Möchtest du das Buch jetzt abschließen?', ok: 'Abschließen', cancel: 'Später' })) finishBookFlow(nb.id);
        }, 400);
      });
    },
  });
}

/* ---------- Session bearbeiten ---------- */

export function sessionSheet(sessionId) {
  const s = store.get().sessions.find(x => x.id === sessionId);
  if (!s) return;
  const html = `
    ${sheetHead('Session', { action: 'sessSave', actionLabel: 'Sichern' })}
    <div class="form">
      <div class="summary-pill">${icon('calendar')}<strong>${fmtDate(s.end)}</strong><span>${s.durationSec ? fmtDuration(s.durationSec) + ' · ' : ''}S. ${fmtNum(s.fromPage)}–${fmtNum(s.toPage)}</span></div>
      <label class="lbl" for="s-chap">Kapitel</label>
      <input id="s-chap" class="input" value="${esc(s.chapter || '')}">
      <label class="lbl" for="s-note">Notiz</label>
      <textarea id="s-note" class="input" rows="6">${esc(s.note || '')}</textarea>
      <button class="btn ghost danger" data-s="delete">${icon('trash')}Session löschen</button>
      <p class="hint">Beim Löschen bleibt die aktuelle Seite des Buchs gleich.</p>
    </div>`;
  openSheet(html, {
    tall: true,
    onMount(root, entry) {
      root.addEventListener('click', async e => {
        if (e.target.closest('[data-s="delete"]')) {
          if (await confirmDialog({ title: 'Session löschen?', ok: 'Löschen', danger: true })) { store.deleteSession(s.id); closeSheet(entry); }
          return;
        }
        if (!e.target.closest('[data-act="sessSave"]')) return;
        const chap = root.querySelector('#s-chap').value.trim();
        store.updateSession(s.id, { chapter: chap, chapterNum: maxChapterNumber(chap), note: root.querySelector('#s-note').value.trim() });
        closeSheet(entry);
        toast('Gespeichert');
      });
    },
  });
}

/* ---------- Buch abschließen: Bewertung + Reflexion ---------- */

export function finishBookFlow(bookId, { already = false, edit = false } = {}) {
  const b = store.book(bookId);
  if (!b) return;
  const qs = store.get().settings.reflectionQuestions;
  const prev = b.reflection || [];
  const rating = { overall: 0, ...(b.rating || {}) };
  let step = 1;
  const answerOf = q => (prev.find(r => r.q === q) || {}).a || '';

  const html = `
    ${sheetHead(edit ? 'Bewertung bearbeiten' : 'Buch abschließen', { cancel: 'Abbrechen' })}
    <div class="steps"><span class="on"></span><span></span></div>
    <div class="form step step1">
      <div class="finish-head">${coverHtml(b, 's')}<div><strong>${esc(b.title)}</strong><span>${esc(b.author || '')}</span></div></div>
      <label class="lbl center">Gesamtbewertung</label>
      ${starsInput('overall', rating.overall, true)}
      <p class="hint center" id="ov-txt">${rating.overall ? '' : 'Tippe auf die linke oder rechte Hälfte eines Sterns'}</p>
      <label class="lbl">Im Detail <small>(optional)</small></label>
      <div class="cat-rows">${RATING_CATEGORIES.map(c => `<div class="cat-row"><span>${c.name}</span>${starsInput(c.id, rating[c.id] || 0)}</div>`).join('')}</div>
      <div class="row2">
        <div><label class="lbl" for="start-date">Begonnen am</label>
          <input id="start-date" type="date" class="input" value="${b.startedAt ? dayKey(b.startedAt) : ''}" max="${dayKey(Date.now())}"></div>
        <div><label class="lbl" for="fin-date">Beendet am</label>
          <input id="fin-date" type="date" class="input" value="${dayKey(b.finishedAt || Date.now())}" max="${dayKey(Date.now())}"></div>
      </div>
      <button class="btn primary big" data-s="next">Weiter zur Reflexion${icon('chevronRight')}</button>
    </div>
    <div class="form step step2" hidden>
      <p class="hint">Nimm dir ein paar Minuten. Deine Antworten helfen dir, das Buch nicht zu vergessen.</p>
      ${qs.map((q, i) => `<label class="lbl" for="r${i}">${esc(q)}</label><textarea id="r${i}" class="input" rows="3" data-q="${esc(q)}">${esc(answerOf(q))}</textarea>`).join('')}
      <button class="btn primary big" data-s="done">${icon('check')}${edit ? 'Speichern' : 'Buch abschließen'}</button>
      <button class="btn ghost" data-s="backstep">Zurück zur Bewertung</button>
    </div>`;

  openSheet(html, {
    tall: true,
    onMount(root, entry) {
      const $ = s => root.querySelector(s);
      const showStep = n => {
        step = n;
        $('.step1').hidden = n !== 1; $('.step2').hidden = n !== 2;
        root.querySelectorAll('.steps span').forEach((s, i) => s.classList.toggle('on', i < n));
        root.closest('.sheet').scrollTop = 0;
        root.scrollTop = 0;
      };
      root.addEventListener('starchange', e => {
        rating[e.detail.name] = e.detail.value;
        if (e.detail.name === 'overall') $('#ov-txt').textContent = (e.detail.value ? ['', 'Nicht meins', 'Ging so', 'Solide', 'Richtig gut', 'Lieblingsbuch'][Math.max(1, Math.floor(e.detail.value))] : '');
      });
      root.addEventListener('click', e => {
        const btn = e.target.closest('[data-s]');
        if (!btn) return;
        if (btn.dataset.s === 'next') {
          if (!rating.overall) { toast('Bitte zuerst eine Gesamtbewertung geben', { icon: 'star' }); return; }
          if ($('#start-date').value && $('#fin-date').value && $('#fin-date').value < $('#start-date').value) { toast('Das Ende liegt vor dem Beginn', { icon: 'info' }); return; }
          showStep(2);
        } else if (btn.dataset.s === 'backstep') showStep(1);
        else if (btn.dataset.s === 'done') {
          const answers = [...root.querySelectorAll('[data-q]')].map(t => ({ q: t.dataset.q, a: t.value.trim() }));
          const missing = answers.findIndex(a => !a.a);
          if (missing >= 0) { root.querySelector(`#r${missing}`).focus(); toast('Bitte alle Fragen beantworten', { icon: 'info' }); return; }
          const [y, m, d] = $('#fin-date').value.split('-').map(Number);
          const isToday = $('#fin-date').value === dayKey(Date.now());
          const finishedAt = isToday ? Date.now() : new Date(y, m - 1, d, 20).getTime();
          const wasFinished = b.status === 'finished' && !already;
          const startKey = $('#start-date').value;
          store.updateBook(b.id, {
            status: 'finished', finishedAt, rating: { ...rating }, reflection: answers,
            currentPage: b.totalPages || b.currentPage,
            startedAt: startKey ? keepTime(startKey, b.startedAt) : (b.startedAt || finishedAt),
          });
          closeSheet(entry);
          if (edit || wasFinished) { toast('Gespeichert'); return; }
          confetti();
          setTimeout(() => finishedCard(b.id), 500);
        }
      });
    },
  });
}

function finishedCard(bookId) {
  const b = store.book(bookId);
  const sessions = store.sessionsOf(bookId);
  const secs = sessions.reduce((a, s) => a + (s.durationSec || 0), 0);
  const days = b.startedAt ? Math.max(1, Math.round((b.finishedAt - b.startedAt) / 86400000) + 1) : null;
  const quotes = store.quotesOf(bookId).length;
  openSheet(`
    <div class="done-card">
      <div class="done-badge">${icon('trophy')}</div>
      <h2>Ausgelesen!</h2>
      <p>${esc(b.title)}</p>
      <div class="done-stats">
        <div><strong>${fmtNum(b.totalPages)}</strong><span>Seiten</span></div>
        ${days ? `<div><strong>${fmtNum(days)}</strong><span>${days === 1 ? 'Tag' : 'Tage'}</span></div>` : ''}
        ${secs ? `<div><strong>${fmtDuration(secs)}</strong><span>Lesezeit</span></div>` : ''}
        <div><strong>${fmtNum(quotes)}</strong><span>${quotes === 1 ? 'Zitat' : 'Zitate'}</span></div>
      </div>
      <button class="btn primary big" data-sheet-close>Schön!</button>
    </div>`);
}

/* ---------- Status ändern ---------- */

export async function setStatus(bookId, status) {
  const b = store.book(bookId);
  if (status === 'abandoned') {
    if (!(await confirmDialog({ title: 'Buch abbrechen?', text: 'Es landet unter „Abgebrochen“. Deine Notizen und Zitate bleiben erhalten.', ok: 'Abbrechen', cancel: 'Weiterlesen', danger: true }))) return;
    store.updateBook(bookId, { status: 'abandoned', finishedAt: Date.now() });
    toast('Unter „Abgebrochen“ abgelegt', { icon: 'flag' });
  } else if (status === 'reading') {
    store.updateBook(bookId, { status: 'reading', startedAt: b.startedAt || Date.now(), finishedAt: null });
    toast('Viel Spaß beim Lesen!', { icon: 'book' });
  } else if (status === 'want') {
    store.updateBook(bookId, { status: 'want' });
  }
}

