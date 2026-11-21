// theme.js – Hell/Dunkel, Farbpalette, Pastell, Icon-Stil
import { themeColors } from './core.js';

const mq = matchMedia('(prefers-color-scheme: dark)');
let current = null;

export function isDark(settings) {
  return settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
}

export function applyTheme(settings) {
  current = settings;
  const dark = isDark(settings);
  const t = themeColors(settings.palette, { dark, pastel: settings.pastel });
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.pastel = settings.pastel ? '1' : '0';
  root.dataset.stroke = settings.iconStroke || 'normal';
  root.style.setProperty('--c1', t.c1);
  root.style.setProperty('--c2', t.c2);
  root.style.setProperty('--c3', t.c3);
  root.style.setProperty('--f1', t.f1);
  root.style.setProperty('--f2', t.f2);
  root.style.setProperty('--f3', t.f3);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--on-accent', t.onAccent);
  root.style.setProperty('--accent-text', t.accentText);
  // Beide theme-color-Einträge (hell/dunkel) an die gewählte Darstellung anpassen
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = dark ? '#0E0B16' : '#F6F4FA'; });
}

mq.addEventListener('change', () => { if (current && current.theme === 'system') applyTheme(current); });
