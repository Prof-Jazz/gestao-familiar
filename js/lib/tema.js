// Tema claro/escuro: guardado no aparelho (localStorage) e aplicado em <html data-tema>.
const CHAVE = 'gf-tema';
export function temaAtual() {
  try { const t = localStorage.getItem(CHAVE); if (t === 'claro' || t === 'escuro') return t; } catch {}
  return 'claro';
}
export function aplicarTema(t) {
  document.documentElement.dataset.tema = t;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'escuro' ? '#0B1220' : '#5B4FE9';
  const Chart = window.Chart;
  if (Chart) {
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--txt2').trim() || '#545B7A';
    Chart.defaults.borderColor = css.getPropertyValue('--grade').trim() || '#EEF0F6';
    Chart.defaults.font.family = "'Jakarta', system-ui, sans-serif";
  }
}
export function definirTema(t) { try { localStorage.setItem(CHAVE, t); } catch {} aplicarTema(t); }
/** Cor de uma variável CSS do tema atual (para gráficos). */
export const corTema = (v, padrao = '') => (getComputedStyle(document.documentElement).getPropertyValue(v).trim() || padrao);
