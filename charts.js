// charts.js – Kreisdiagramm, Balken, Kalender als SVG
import { fmtNum, fmtDate, fmtDuration, MONTHS_SHORT, WEEKDAYS_SHORT } from './core.js';
import { esc } from './ui.js';

let gid = 0;

/** Fortschrittsring mit Farbverlauf */
export function ring(progress, { size = 120, stroke = 12, label = '', sub = '', cls = '' } = {}) {
  const id = 'rg' + (++gid);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  return `<div class="ring ${cls}" style="width:${size}px;height:${size}px" role="img" aria-label="${Math.round(p * 100)} Prozent">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--c1)"/><stop offset=".55" stop-color="var(--c2)"/><stop offset="1" stop-color="var(--c3)"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
      <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="--c:${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    ${label !== '' ? `<div class="ring-label"><strong>${label}</strong>${sub ? `<span>${sub}</span>` : ''}</div>` : ''}
  </div>`;
}

/** Balkendiagramm (eine Reihe). items: [{label, value, tip}] */
export function bars(items, { height = 140, unit = 'Seiten', highlightLast = true } = {}) {
  const max = Math.max(1, ...items.map(i => i.value));
  const nice = niceMax(max);
  const w = 100 / items.length;
  const cols = items.map((it, i) => {
    const h = (it.value / nice) * 100;
    const last = highlightLast && i === items.length - 1;
    return `<button class="bar-col ${last ? 'last' : ''}" style="width:${w}%" data-tip="${esc(it.tip || `${it.label}: ${fmtNum(it.value)} ${unit}`)}">
      <span class="bar" style="height:${it.value > 0 ? Math.max(2, h) : 0}%"></span>
      <span class="bar-x">${esc(it.label)}</span></button>`;
  }).join('');
  return `<div class="bars" style="height:${height}px">
    <div class="bars-grid"><span data-v="${fmtNum(nice)}"></span><span data-v="${fmtNum(nice / 2)}"></span><span data-v="0"></span></div>
    <div class="bars-cols">${cols}</div>
    <div class="chart-tip" hidden></div>
  </div>`;
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Kalender-Heatmap aus core.heatmap() */
export function heatmapSvg(hm, { cell = 11, gap = 3 } = {}) {
  const weeks = Math.max(...hm.cells.map(c => c.col)) + 1;
  const left = 18, top = 14;
  const W = left + weeks * (cell + gap), H = top + 7 * (cell + gap);
  let months = '';
  let lastMonth = -1;
  for (const c of hm.cells) {
    if (c.row !== 0) continue;
    const m = new Date(c.date).getMonth();
    if (m !== lastMonth) {
      if (lastMonth !== -1 || c.col === 0) months += `<text x="${left + c.col * (cell + gap)}" y="9" class="hm-m">${MONTHS_SHORT[m].replace('.', '')}</text>`;
      lastMonth = m;
    }
  }
  const days = [0, 2, 4].map(r => `<text x="0" y="${top + r * (cell + gap) + cell - 2}" class="hm-m">${WEEKDAYS_SHORT[(r + 1) % 7]}</text>`).join('');
  const rects = hm.cells.filter(c => !c.future).map(c => {
    const tip = `${fmtDate(c.date)}: ${c.pages ? fmtNum(c.pages) + ' Seiten' : 'nicht gelesen'}${c.seconds ? ' · ' + fmtDuration(c.seconds) : ''}`;
    return `<rect x="${left + c.col * (cell + gap)}" y="${top + c.row * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="hm l${c.level}" data-tip="${esc(tip)}"/>`;
  }).join('');
  return `<div class="heatmap"><svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMin meet">${months}${days}${rects}</svg>
    <div class="hm-legend"><span>weniger</span>${[0, 1, 2, 3, 4].map(l => `<i class="hm-key l${l}"></i>`).join('')}<span>mehr</span></div>
    <div class="chart-tip" hidden></div></div>`;
}

/** Tippen auf Balken/Zellen zeigt den Wert */
export function bindTips(root) {
  root.querySelectorAll('.bars, .heatmap').forEach(chart => {
    const tip = chart.querySelector('.chart-tip');
    chart.addEventListener('click', e => {
      const t = e.target.closest('[data-tip]');
      chart.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
      if (!t) { tip.hidden = true; return; }
      t.classList.add('sel');
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      const cr = chart.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const x = Math.min(Math.max(tr.left + tr.width / 2 - cr.left, 70), cr.width - 70);
      tip.style.left = x + 'px';
      tip.style.top = Math.max(0, tr.top - cr.top - 36) + 'px';
    });
  });
}
