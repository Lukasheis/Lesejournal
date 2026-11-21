// nav.js – Ansichten, Tabs und Zurück-Navigation
import { hydratePhotos } from './ui.js';
import { bindTips } from './charts.js';

export const VIEWS = {};
const state = { tab: 'today', stack: [] };

export const nav = {
  get current() {
    return state.stack.length ? state.stack[state.stack.length - 1] : { name: state.tab, params: {} };
  },
  get tabName() { return state.tab; },
  tab(t) {
    if (state.tab === t && !state.stack.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    state.tab = t; state.stack = [];
    render({ top: true, anim: 'fade' });
  },
  push(name, params = {}) {
    state.stack.push({ name, params, scroll: window.scrollY });
    render({ top: true, anim: 'push' });
  },
  back() {
    const prev = state.stack.pop();
    render({ anim: 'pop', scroll: prev ? prev.scroll : 0 });
  },
  /** Zurück, falls die aktuelle Ansicht ein gelöschtes Objekt zeigt */
  resetTo(tab) { state.tab = tab; state.stack = []; render({ top: true }); },
};

export function render({ top = false, anim = null, scroll = null } = {}) {
  const root = document.getElementById('view');
  const cur = nav.current;
  const v = VIEWS[cur.name];
  if (!v) return;
  const y = window.scrollY;
  root.innerHTML = v.render(cur.params || {});
  root.dataset.view = cur.name;
  if (anim) {
    root.classList.remove('anim-push', 'anim-pop', 'anim-fade');
    void root.offsetWidth;
    root.classList.add('anim-' + anim);
  }
  if (v.mount) v.mount(root, cur.params || {});
  hydratePhotos(root);
  bindTips(root);
  document.querySelectorAll('.tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  if (top) window.scrollTo(0, 0);
  else if (scroll != null) window.scrollTo(0, scroll);
  else window.scrollTo(0, y);
}
