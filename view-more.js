// view-more.js – Einstellungen: Erscheinungsbild, Ziele, Timer & Fokus, Zitat-Erinnerungen, Backup
import * as store from './store.js';
import { fmtNum, fmtDate, PALETTES, themeColors, quotesToText, DEFAULT_QUESTIONS, APP_VERSION } from './core.js';
import { icon } from './icons.js';
import { esc, A, segmented, toggle, toast, confirmDialog, openSheet, closeSheet, sheetHead, shareOrDownload, pickFile, runShortcut } from './ui.js';
import { VIEWS, nav, render } from './nav.js';
import { applyTheme, isDark } from './theme.js';

let storage = null;

VIEWS.more = {
  render() {
    const d = store.get();
    const s = d.settings;
    const dark = isDark(s);
    const newQuotes = s.quotesExportedAt ? d.quotes.filter(q => q.createdAt > s.quotesExportedAt).length : d.quotes.length;
    return `
    <header class="page-head sub"><button class="back" data-act="back">${icon('chevronLeft')}Zurück</button></header>
    <header class="page-head"><div><p class="eyebrow">Einstellungen</p><h1>Mehr</h1></div></header>

    <h2 class="group-title">Erscheinungsbild</h2>
    <section class="card group">
      <div class="g-row col"><span class="g-lbl">${icon('moon')}Darstellung</span>
        ${segmented('theme', [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'Wie iPhone']], s.theme)}</div>
      <div class="g-row col"><span class="g-lbl">${icon('palette')}Farbpalette</span>
        <div class="palettes">${PALETTES.map(p => {
          const t = themeColors(p.id, { dark, pastel: s.pastel });
          return `<button class="pal ${p.id === s.palette ? 'on' : ''}" data-act="setPalette" data-id="${p.id}">
            <span class="pal-sw" style="background:linear-gradient(135deg,${t.c1},${t.c2} 55%,${t.c3})"></span><small>${p.name}</small></button>`;
        }).join('')}</div></div>
      <div class="g-row"><span class="g-lbl">${icon('sparkle')}Pastellfarben</span>${toggle('pastel', s.pastel)}</div>
      <div class="g-row col"><span class="g-lbl">${icon('pen')}Icon-Stil</span>
        ${segmented('iconStroke', [['thin', 'Fein'], ['normal', 'Normal'], ['bold', 'Kräftig']], s.iconStroke)}</div>
    </section>

    <h2 class="group-title" id="goals">Ziele</h2>
    <section class="card group">
      <div class="g-row"><span class="g-lbl">${icon('target')}Bücher pro Jahr</span>
        <span class="stepper"><button data-act="step" data-name="yearGoal" data-d="-1" aria-label="weniger">−</button><b>${s.yearGoal}</b><button data-act="step" data-name="yearGoal" data-d="1" aria-label="mehr">+</button></span></div>
      <div class="g-row"><span class="g-lbl">${icon('book')}Seiten pro Tag</span>
        <span class="stepper"><button data-act="step" data-name="dailyGoalPages" data-d="-5" aria-label="weniger">−</button><b>${s.dailyGoalPages}</b><button data-act="step" data-name="dailyGoalPages" data-d="5" aria-label="mehr">+</button></span></div>
    </section>

    <h2 class="group-title">Lese-Timer & Nicht stören</h2>
    <section class="card group">
      <div class="g-row"><span class="g-lbl">${icon('focus')}Fokus per Kurzbefehl</span>${toggle('focusShortcut', s.focusShortcut)}</div>
      ${s.focusShortcut ? `
      <div class="g-row col"><label class="g-lbl" for="sc-start">Kurzbefehl beim Start</label><input id="sc-start" class="input" value="${esc(s.shortcutStart)}" data-setting="shortcutStart"></div>
      <div class="g-row"><span class="g-lbl">Fokus am Ende ausschalten</span>${toggle('focusEndShortcut', s.focusEndShortcut)}</div>
      ${s.focusEndShortcut ? `<div class="g-row col"><label class="g-lbl" for="sc-end">Kurzbefehl am Ende</label><input id="sc-end" class="input" value="${esc(s.shortcutEnd)}" data-setting="shortcutEnd"></div>` : ''}
      <div class="g-row"><button class="link" data-act="testShortcut">${icon('play')}Kurzbefehl testen</button></div>` : ''}
      <button class="g-row link-row" data-act="helpFocus"><span class="g-lbl">${icon('info')}So richtest du es ein</span>${icon('chevronRight')}</button>
    </section>

    <h2 class="group-title">Zitat-Erinnerungen</h2>
    <section class="card group">
      <p class="g-note">Die App kann selbst keine Mitteilungen verschicken. Deshalb sicherst du deine Zitate als Datei. Ein Kurzbefehl zeigt dir daraus regelmäßig ein zufälliges Zitat als Mitteilung.</p>
      <button class="g-row link-row" data-act="exportQuotes"><span class="g-lbl">${icon('share')}Zitate für Kurzbefehl sichern</span>
        <span class="g-val">${newQuotes ? `<span class="badge">${newQuotes} neu</span>` : (s.quotesExportedAt ? fmtDate(s.quotesExportedAt, { year: false }) : '')}</span></button>
      <button class="g-row link-row" data-act="helpQuotes"><span class="g-lbl">${icon('info')}So richtest du es ein</span>${icon('chevronRight')}</button>
      <button class="g-row link-row" data-act="allQuotes"><span class="g-lbl">${icon('quote')}Alle Zitate</span><span class="g-val">${fmtNum(d.quotes.length)}${icon('chevronRight')}</span></button>
    </section>

    <h2 class="group-title">Reflexionsfragen beim Abschließen</h2>
    <section class="card group">
      ${s.reflectionQuestions.map((q, i) => `<button class="g-row link-row" data-act="editQuestion" data-i="${i}"><span class="g-lbl q">${esc(q)}</span>${icon('edit')}</button>`).join('')}
      <div class="g-row"><button class="link" data-act="editQuestion" data-i="-1">${icon('plus')}Frage hinzufügen</button>
        <button class="link muted" data-act="resetQuestions">Standard</button></div>
    </section>

    <h2 class="group-title" id="backup">Daten & Backup</h2>
    <section class="card group">
      <p class="g-note">Alle Daten liegen nur auf diesem iPhone – kein Server, keine Cloud. <strong>Wichtig:</strong> Wenn du das App-Icon löschst, sind die Daten weg. Erstelle regelmäßig ein Backup (z. B. in iCloud Drive sichern).</p>
      <button class="g-row link-row" data-act="exportBackup"><span class="g-lbl">${icon('upload')}Backup erstellen</span>
        <span class="g-val">${s.lastBackup ? fmtDate(s.lastBackup) : '<span class="badge warn">noch nie</span>'}</span></button>
      <button class="g-row link-row" data-act="importBackup"><span class="g-lbl">${icon('download')}Backup wiederherstellen</span>${icon('chevronRight')}</button>
      <div class="g-row"><span class="g-lbl">${icon('shield')}Speicher</span><span class="g-val" id="storage-info">${storageText()}</span></div>
      <button class="g-row link-row danger" data-act="wipe"><span class="g-lbl">${icon('trash')}Alle Daten löschen</span></button>
    </section>

    <p class="foot">Lesejournal ${APP_VERSION} · ${fmtNum(d.books.length)} Bücher · ${fmtNum(d.sessions.length)} Sessions · ${fmtNum(d.quotes.length)} Zitate</p>
    `;
  },
  mount(root) {
    root.addEventListener('segchange', e => {
      const { name, value } = e.detail;
      if (name === 'theme' || name === 'iconStroke') { store.setSetting(name, value); applyTheme(store.get().settings); }
    });
    root.addEventListener('togglechange', e => {
      const { name, on } = e.detail;
      store.setSetting(name, on);
      if (name === 'pastel') applyTheme(store.get().settings);
    });
    root.querySelectorAll('[data-setting]').forEach(inp => inp.addEventListener('change', () => {
      store.setSetting(inp.dataset.setting, inp.value.trim() || (inp.dataset.setting === 'shortcutStart' ? 'Lesezeit' : 'Lesezeit Ende'));
    }));
    if (!storage) store.storageInfo().then(i => { storage = i; const el = document.getElementById('storage-info'); if (el) el.textContent = storageText(); });
  },
};

function storageText() {
  if (!storage) return '…';
  const mb = storage.usage != null ? `${fmtNum(storage.usage / 1048576, 1)} MB` : '';
  return `${storage.persisted ? 'dauerhaft' : 'nicht dauerhaft'}${mb ? ' · ' + mb : ''}`;
}

/* ---------- Hilfetexte ---------- */

function helpSheet(title, steps, extra = '') {
  openSheet(`${sheetHead(title, { cancel: 'Schließen' })}
    <div class="form help">${extra}<ol class="steps-list">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <p class="hint">Ausführlich mit allen Schritten: siehe ANLEITUNG.md</p></div>`, { tall: true });
}

Object.assign(A, {
  setPalette: el => { store.setSetting('palette', el.dataset.id); applyTheme(store.get().settings); render(); },
  step: el => {
    const s = store.get().settings;
    const name = el.dataset.name;
    const min = name === 'yearGoal' ? 1 : 5;
    const max = name === 'yearGoal' ? 365 : 500;
    store.setSetting(name, Math.min(max, Math.max(min, s[name] + Number(el.dataset.d))));
  },
  testShortcut: () => runShortcut(store.get().settings.shortcutStart, '0'),
  helpFocus: () => helpSheet('Nicht stören beim Lesen', [
    'Einstellungen → <b>Fokus</b> → <b>+</b> → <b>Lesen</b> anlegen (Mitteilungen stummschalten, erlaubte Personen nach Wunsch).',
    'App <b>Kurzbefehle</b> öffnen → <b>+</b> → Name: <b>Lesezeit</b>.',
    'Aktion <b>Fokus festlegen</b> hinzufügen → <b>Lesen</b> → <b>Einschalten</b> → „Bis“: <b>Ausgeschaltet</b>.',
    'Optional für den Countdown: Aktion <b>Wenn</b> → „Kurzbefehleingabe“ <b>ist größer als</b> 0 → darin <b>Timer starten</b> mit „Kurzbefehleingabe“ <b>Minuten</b>.',
    'Zweiten Kurzbefehl <b>Lesezeit Ende</b> anlegen: <b>Fokus festlegen</b> → Lesen → <b>Ausschalten</b>.',
    'Hier oben <b>Fokus per Kurzbefehl</b> einschalten und mit <b>Kurzbefehl testen</b> prüfen.',
    'Nach dem Start kommst du über <b>◀ oben links</b> oder durch Wischen zurück in die App.',
  ]),
  helpQuotes: () => helpSheet('Zitate als Mitteilung', [
    'Hier auf <b>Zitate für Kurzbefehl sichern</b> tippen → <b>In „Dateien“ sichern</b> → <b>iCloud Drive → Shortcuts</b> → Sichern (vorhandene Datei ersetzen).',
    'App <b>Kurzbefehle</b> → <b>+</b> → Name: <b>Zitat des Tages</b>.',
    'Aktion <b>Datei abrufen</b> → Ordner <b>Shortcuts</b>, Pfad <b>Zitate.txt</b>, „Fehler, wenn nicht gefunden“ aus.',
    'Aktion <b>Text teilen</b> → bei <b>Neue Zeilen</b>.',
    'Aktion <b>Objekt aus Liste abrufen</b> → <b>Zufälliges Objekt</b>.',
    'Aktion <b>Mitteilung anzeigen</b> → Text: „Objekt aus Liste“, Titel: <b>Zitat des Tages</b>.',
    'Tab <b>Automation</b> → <b>+</b> → <b>Tageszeit</b> (z. B. 9:00, täglich) → <b>Sofort ausführen</b> → Kurzbefehl <b>Zitat des Tages</b>. Für mehrere Zeiten weitere Automationen anlegen.',
    'Nach neuen Zitaten einfach Schritt 1 wiederholen.',
  ]),
  exportQuotes: async () => {
    const d = store.get();
    if (!d.quotes.length) { toast('Noch keine Zitate vorhanden', { icon: 'info' }); return; }
    const file = new File([quotesToText(d.quotes, d.books)], 'Zitate.txt', { type: 'text/plain' });
    if (await shareOrDownload(file, 'Zitate')) { store.setSetting('quotesExportedAt', Date.now()); toast('Zitate gesichert'); }
  },
  editQuestion: el => {
    const i = Number(el.dataset.i);
    const qs = store.get().settings.reflectionQuestions;
    openSheet(`${sheetHead(i < 0 ? 'Neue Frage' : 'Frage bearbeiten', { action: 'qSave', actionLabel: 'Sichern' })}
      <div class="form"><textarea id="q-edit" class="input" rows="3">${esc(i >= 0 ? qs[i] : '')}</textarea>
      ${i >= 0 && qs.length > 1 ? `<button class="btn ghost danger" data-s="del">${icon('trash')}Frage entfernen</button>` : ''}</div>`, {
      onMount(root, entry) {
        root.querySelector('#q-edit').focus();
        root.addEventListener('click', e => {
          if (e.target.closest('[data-s="del"]')) {
            store.update(d => d.settings.reflectionQuestions.splice(i, 1)); closeSheet(entry); return;
          }
          if (!e.target.closest('[data-act="qSave"]')) return;
          const v = root.querySelector('#q-edit').value.trim();
          if (!v) return;
          store.update(d => { if (i < 0) d.settings.reflectionQuestions.push(v); else d.settings.reflectionQuestions[i] = v; });
          closeSheet(entry);
        });
      },
    });
  },
  resetQuestions: async () => {
    if (await confirmDialog({ title: 'Standardfragen wiederherstellen?', ok: 'Wiederherstellen' })) store.setSetting('reflectionQuestions', DEFAULT_QUESTIONS.slice());
  },
  exportBackup: async () => {
    try {
      toast('Backup wird erstellt …', { icon: 'refresh' });
      const file = await store.createBackupFile();
      if (await shareOrDownload(file, 'Lesejournal-Backup')) { store.markBackupDone(); toast('Backup erstellt'); }
    } catch (e) { toast('Backup fehlgeschlagen: ' + e.message, { icon: 'info' }); }
  },
  importBackup: async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    if (!(await confirmDialog({ title: 'Backup wiederherstellen?', text: 'Alle aktuellen Daten in der App werden durch das Backup ersetzt.', ok: 'Wiederherstellen', danger: true }))) return;
    try {
      await store.restoreBackup(file);
      applyTheme(store.get().settings);
      nav.resetTo('today');
      toast('Backup wiederhergestellt');
    } catch (e) { toast(e.message, { icon: 'info' }); }
  },
  wipe: async () => {
    if (!(await confirmDialog({ title: 'Alle Daten löschen?', text: 'Bücher, Sessions, Zitate und Fotos werden von diesem iPhone gelöscht. Das kann nicht rückgängig gemacht werden.', ok: 'Weiter', danger: true }))) return;
    if (!(await confirmDialog({ title: 'Wirklich alles löschen?', text: 'Hast du ein Backup?', ok: 'Endgültig löschen', danger: true }))) return;
    await store.wipeAll();
    applyTheme(store.get().settings);
    nav.resetTo('today');
    toast('Alle Daten gelöscht', { icon: 'trash' });
  },
});
