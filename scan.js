// scan.js – ISBN-Barcode (ZXing) und Texterkennung (Tesseract) direkt am Gerät
import { normalizeIsbn, cleanOcrText, suggestTitleAuthor } from './core.js';
import { icon } from './icons.js';
import { loadImage } from './store.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => { loaded.delete(src); reject(new Error('Bibliothek konnte nicht geladen werden. Beim ersten Mal braucht die App dafür Internet.')); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}

function makeReader() {
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  return new Z.BrowserMultiFormatReader(hints, 250);
}

/**
 * Öffnet die Kamera als Vollbild und liefert die ISBN-13 (oder null bei Abbruch).
 * Fallback: Foto aufnehmen und daraus lesen.
 */
export async function scanIsbn() {
  await loadScript(ZXING_URL);
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'scanner';
    el.innerHTML = `<video playsinline muted autoplay></video>
      <div class="scan-frame"><span></span></div>
      <div class="scan-top"><button class="round glass" data-x>${icon('close')}</button></div>
      <div class="scan-bottom">
        <p class="scan-hint">Halte den Strichcode auf der Rückseite in den Rahmen</p>
        <button class="btn glass" data-photo>${icon('camera')}Stattdessen Foto aufnehmen</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const video = el.querySelector('video');
    const hint = el.querySelector('.scan-hint');
    const reader = makeReader();
    let done = false;

    const finish = val => {
      if (done) return;
      done = true;
      try { reader.reset(); } catch (e) { /* ignorieren */ }
      el.classList.remove('open');
      setTimeout(() => el.remove(), 250);
      resolve(val);
    };

    const handle = text => {
      const isbn = normalizeIsbn(text);
      if (isbn) { el.classList.add('hit'); setTimeout(() => finish(isbn), 250); return true; }
      hint.textContent = `Code ${text} ist keine ISBN – bitte den Code mit 978/979 scannen`;
      return false;
    };

    el.querySelector('[data-x]').onclick = () => finish(null);
    el.querySelector('[data-photo]').onclick = async () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        hint.textContent = 'Lese Strichcode aus dem Foto …';
        try {
          const img = await loadImage(f);
          const res = await reader.decodeFromImageElement(img);
          if (!handle(res.getText())) return;
        } catch (e) {
          hint.textContent = 'Kein Strichcode erkannt. Näher ran, gerade halten, gutes Licht.';
        }
      };
      input.click();
    };

    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      video,
      (result) => { if (result && !done) handle(result.getText()); }
    ).catch(() => {
      hint.textContent = 'Kein Kamerazugriff. Erlaube die Kamera oder nimm ein Foto auf.';
    });
  });
}

/* ---------- Texterkennung ---------- */

let workerPromise = null;
let progressFn = null;

async function worker() {
  await loadScript(TESS_URL);
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('deu', 1, {
      logger: m => { if (progressFn && m.status) progressFn(m); },
    }).catch(e => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Bild verkleinern, in Graustufen und kontrastreicher machen */
async function prepare(file, max = 1800) {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.3)';
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function describe(m) {
  if (m.status === 'recognizing text') return `Erkenne Text … ${Math.round(m.progress * 100)} %`;
  if (/load|initializ/i.test(m.status)) return 'Lade Texterkennung (einmalig ca. 2 MB) …';
  return 'Bereite vor …';
}

/** Freien Text erkennen (Zitat, Klappentext) */
export async function ocrText(file, onProgress) {
  progressFn = m => onProgress && onProgress(describe(m));
  try {
    const w = await worker();
    const canvas = await prepare(file);
    const { data } = await w.recognize(canvas);
    return cleanOcrText(data.text);
  } finally { progressFn = null; }
}

/** Cover: Zeilen mit Höhe für Titel/Autor-Vorschlag */
export async function ocrCover(file, onProgress) {
  progressFn = m => onProgress && onProgress(describe(m));
  try {
    const w = await worker();
    const canvas = await prepare(file, 1400);
    const { data } = await w.recognize(canvas);
    const lines = (data.lines || []).map(l => ({ text: l.text, height: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0 }));
    return suggestTitleAuthor(lines);
  } finally { progressFn = null; }
}
