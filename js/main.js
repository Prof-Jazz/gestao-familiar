import { render } from 'preact';
import { html } from './ui/comp.js';
import { App } from './ui/app.js';
import { store, iniciar } from './data/store.js';
import { criarBackendSupabase } from './data/backend-supabase.js';
import { criarBackendDemo } from './data/backend-demo.js';

const cfg = window.GF_CONFIG || {};
const demo = new URLSearchParams(location.search).has('demo');
render(html`<${App} />`, document.getElementById('app'));

if (window.Chart) {
  Chart.defaults.font.family = "'Jakarta', system-ui, sans-serif";
  Chart.defaults.color = '#545B7A';
}
if (demo) {
  try { iniciar(criarBackendDemo()).catch((e) => { console.error(e); store.set({ fase: "erro", erro: e.message }); }); } catch (e) { console.error(e); store.set({ fase: "erro", erro: e.message }); }
} else if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  store.set({ fase: 'config' });
} else {
  iniciar(criarBackendSupabase(cfg)).catch((e) => store.set({ fase: 'erro', erro: e.message }));
}
