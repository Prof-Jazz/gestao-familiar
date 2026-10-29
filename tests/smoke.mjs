import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8080/?demo';
const browser = await chromium.launch();
const erros = [];
async function rodar(vp, nome) {
  const page = await browser.newPage({ viewport: vp });
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`[${nome}] ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`[${nome}] PAGEERROR ${e.message}`));
  await page.goto(base);
  await page.getByText('Entrar como Jesrrael (demo)').click();
  await page.waitForSelector('.kpi');
  for (const r of ['painel', 'lancamentos', 'calendario', 'contas', 'analises', 'orcamento', 'projetos', 'relatorios', 'config']) {
    await page.goto(base.replace(/#.*/, '') + '#/' + r); await page.waitForTimeout(700);
    await page.screenshot({ path: `/home/claude/gf/tests/shots/${nome}-${r}.png`, fullPage: r !== 'analises' });
  }
  await page.close();
}
await rodar({ width: 1400, height: 900 }, 'desk');
await rodar({ width: 390, height: 844 }, 'mob');
console.log(erros.length ? erros.join('\n') : 'SEM ERROS');
await browser.close();
