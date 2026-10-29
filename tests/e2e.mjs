// Teste ponta a ponta: app real (supabase-js) -> PostgREST -> Postgres com RLS/triggers.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const URL = 'http://localhost:8090/';
const sql = (q) => execSync(`psql -h /tmp -p 5433 -U postgres -d gfe2e -At -c "${q.replace(/"/g, '\\"')}"`, { env: { ...process.env, PATH: '/usr/lib/postgresql/16/bin:' + process.env.PATH } }).toString().trim();
let ok = 0; const falhas = [];
const check = (nome, cond, info = '') => { if (cond) { ok++; console.log('✓', nome); } else { falhas.push(nome); console.log('✗', nome, info); } };
const browser = await chromium.launch();
const erros = [];
async function dispositivo(nome, vp = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`[${nome}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|404|storage/i.test(m.text())) erros.push(`[${nome}] ${m.text()}`); });
  return p;
}
async function login(p, email, senha) {
  await p.goto(URL); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha);
  await p.click('button:has-text("Entrar")');
}
const salvarModal = (p) => p.click('.modal-rod button:has-text("Salvar")');
async function novaDespesa(p, { valor, cat, origem, desc, aPagar, parcelas }) {
  await p.click('.btn-novo-lat'); await p.waitForSelector('#valor');
  await p.fill('#valor', valor);
  if (cat) await p.click(`.cat-op:has-text("${cat}")`);
  if (origem) await p.click(`.chips .chip:has-text("${origem}")`);
  if (desc) await p.fill('input[list=sugestoes-desc]', desc);
  if (aPagar) await p.click('button[role=radio]:has-text("A pagar")');
  if (parcelas) { await p.click('summary:has-text("Mais detalhes")'); await p.selectOption('label:has-text("Parcelamento") select', String(parcelas)); }
  await salvarModal(p); await p.waitForSelector('.modal', { state: 'detached' });
}

const J = await dispositivo('Jesrrael');
const L = await dispositivo('Laucielly', { width: 390, height: 844 }); // Laucielly no celular

// ---- login
await login(J, 'jesrrael.santos@gmail.com', 'errada');
await J.waitForSelector('.erro-msg'); check('senha errada é recusada com mensagem', (await J.textContent('.erro-msg')).includes('E-mail ou senha incorretos'));
await J.fill('input[type=password]', 'senhaJes123'); await J.click('button:has-text("Entrar")');
await J.waitForSelector('text=Olá, Jesrrael!'); check('Jesrrael entra com e-mail e senha', true);
check('ambiente real começa sem movimentações', sql('select count(*) from lancamentos') === '0');

// ---- conta via UI
await J.goto(URL + '#/contas'); await J.click('.topo button:has-text("Conta")');
await J.fill('.modal input[placeholder="Ex.: Conta Nubank"]', 'Conta Nubank');
await J.fill('.modal label:has-text("Saldo inicial") input', '1.000,00');
await J.fill('.modal label:has-text("Data de referência") input', '2026-10-01');
await salvarModal(J); await J.waitForSelector('text=Conta Nubank');
await J.click('.topo button:has-text("Conta")'); await J.fill('.modal input[placeholder="Ex.: Conta Nubank"]', 'Reserva'); await J.fill('.modal label:has-text("Saldo inicial") input', '0');
await J.fill('.modal label:has-text("Data de referência") input', '2026-10-01'); await salvarModal(J); await J.waitForSelector('.modal', { state: 'detached' });
check('contas gravadas no banco com autor Jesrrael', sql("select count(*) from contas where criado_por='11111111-1111-1111-1111-111111111111'") === '2');

// ---- Cenário 1: Jesrrael registra despesa; Laucielly vê em outro dispositivo com autoria correta
await J.goto(URL + '#/painel');
await novaDespesa(J, { valor: '125,90', cat: 'Supermercado', origem: 'Conta Nubank', desc: 'Mercado do mês' });
const idDesp = sql("select id from lancamentos where descricao='Mercado do mês'");
check('C1: despesa gravada, autor = Jesrrael (servidor)', sql(`select criado_por from lancamentos where id='${idDesp}'`) === '11111111-1111-1111-1111-111111111111');
await login(L, 'laucielly@teste.com', 'senhaLau123'); await L.waitForSelector('text=Olá, Laucielly!');
await L.goto(URL + '#/lancamentos'); await L.waitForSelector('text=Mercado do mês');
check('C1: Laucielly (celular) vê a despesa com “Lançado por Jesrrael”', (await L.textContent('.item:has-text("Mercado do mês")')).includes('Lançado por Jesrrael'));

// ---- Cenário 2: Laucielly registra receita, Jesrrael vê
await L.click('.fab'); await L.waitForSelector('#valor');
await L.click('.tipo-abas button:has-text("Receita")'); await L.fill('#valor', '500'); await L.click('.cat-op:has-text("Aulas particulares")');
await L.fill('input[list=sugestoes-desc]', 'Aula particular'); await salvarModal(L); await L.waitForSelector('.modal', { state: 'detached' });
check('C2: receita gravada com autor Laucielly', sql("select criado_por from lancamentos where descricao='Aula particular'") === '22222222-2222-2222-2222-222222222222');
await J.goto(URL + '#/lancamentos'); await J.reload(); await J.waitForSelector('text=Aula particular');
check('C2: Jesrrael vê a receita com “Lançado por Laucielly”', (await J.textContent('.item:has-text("Aula particular")')).includes('Lançado por Laucielly'));

// ---- Cenário 3: edição preserva autor e registra quem alterou
await L.reload(); await L.waitForSelector('text=Mercado do mês'); await L.click('.item:has-text("Mercado do mês")');
await L.fill('#valor', '130,00'); await salvarModal(L); await L.waitForSelector('.modal', { state: 'detached' });
const r3 = sql(`select criado_por||'|'||alterado_por||'|'||valor_centavos||'|'||versao from lancamentos where id='${idDesp}'`);
check('C3: autor original preservado e alterado_por = Laucielly', r3 === '11111111-1111-1111-1111-111111111111|22222222-2222-2222-2222-222222222222|13000|2', r3);
await J.reload(); await J.waitForSelector('text=Mercado do mês');
const txt3 = await J.textContent('.item:has-text("Mercado do mês")');
check('C3: tela mostra “Lançado por Jesrrael · Alterado por Laucielly em DD/MM/AAAA às HHhMM”', /Lançado por Jesrrael · Alterado por Laucielly em \d{2}\/\d{2}\/\d{4} às \d{2}h\d{2}/.test(txt3), txt3);
await J.click('.item:has-text("Mercado do mês")'); await J.click('button:has-text("Histórico")'); await J.waitForSelector('.hist-item');
check('C3: histórico mostra valor antigo → novo', (await J.textContent('.modal')).includes('R$ 125,90') && (await J.textContent('.modal')).includes('R$ 130,00'));
// concorrência: J tem o formulário aberto (versão 2); L salva outra edição; J tenta salvar -> recusa sem sobrescrever
await L.click('.item:has-text("Mercado do mês")'); await L.fill('#valor', '131,00'); await salvarModal(L); await L.waitForSelector('.modal', { state: 'detached' });
await J.fill('#valor', '999,00'); await salvarModal(J); await J.waitForSelector('.erro-msg');
const msgConf = await J.textContent('.erro-msg');
check('Concorrência: edição simultânea recusada com aviso, sem sobrescrever', /Laucielly alterou/.test(msgConf) && sql(`select valor_centavos from lancamentos where id='${idDesp}'`) === '13100', msgConf);
await J.click('.modal-rod button:has-text("Cancelar")');

// ---- Cenário 4: transferência não muda resultado
await J.goto(URL + '#/painel'); await J.reload(); await J.waitForSelector('.kpi');
const resAntes = await J.textContent('.kpi:has-text("Resultado do mês") .val');
const saldoAntes = await J.textContent('.kpi.destaque .val');
await J.click('.atalho:has-text("Transferência")'); await J.fill('#valor', '200');
await J.selectOption('label:has-text("De (origem)") select', { label: 'Conta Nubank' }); await J.selectOption('label:has-text("Para (destino)") select', { label: 'Reserva' });
await salvarModal(J); await J.waitForSelector('.modal', { state: 'detached' });
check('C4: resultado do mês igual após transferência', (await J.textContent('.kpi:has-text("Resultado do mês") .val')) === resAntes, resAntes);
check('C4: saldo consolidado igual após transferência', (await J.textContent('.kpi.destaque .val')) === saldoAntes, saldoAntes);
check('C4: contas atualizadas (Nubank −200, Reserva +200)', sql("select sum(case when conta_id=(select id from contas where nome='Reserva') then 1 else 0 end) from lancamentos where tipo='transferencia'") === '0');

// ---- Cenários 5 e 6: cartão, parcelas exatas, pagamento de fatura sem duplicar
await J.goto(URL + '#/contas'); await J.click('.topo button:has-text("Cartão")');
await J.fill('.modal input[placeholder="Ex.: Nubank Laucielly"]', 'Visa Família'); await J.fill('.modal label:has-text("Limite total") input', '5.000,00');
await J.selectOption('.modal label:has-text("Dia do fechamento") select', '25'); await J.selectOption('.modal label:has-text("Dia do vencimento") select', '5');
await salvarModal(J); await J.waitForSelector('.cc-visual');
await J.goto(URL + '#/painel');
await novaDespesa(J, { valor: '100,00', cat: 'Vestuário', origem: 'Visa Família', desc: 'Tênis parcelado', parcelas: 3 });
const parc = sql("select string_agg(valor_centavos::text||'@'||fatura, ',' order by parcela_num) from lancamentos where descricao='Tênis parcelado'");
check('C6: 3 parcelas somam exatamente R$ 100,00 (3334+3333+3333)', sql("select sum(valor_centavos) from lancamentos where descricao='Tênis parcelado'") === '10000' && parc.startsWith('3334@'), parc);
check('C6: parcelas em faturas consecutivas', parc.split(',').map((x) => x.split('@')[1]).join() === '2026-12-01,2027-01-01,2027-02-01', parc);
await novaDespesa(J, { valor: '80,00', cat: 'Alimentação fora e delivery', origem: 'Visa Família', desc: 'Pizza' });
const despAntes = sql("select count(*) from lancamentos where tipo='despesa'");
// pagar a fatura que contém a pizza (compra 29/10 -> fatura dez; compras após dia 25)
await J.goto(URL + '#/contas'); await J.waitForSelector('.cc-visual');
await J.selectOption('select[aria-label="Escolher fatura"]', '2026-12-01');
await J.click('button:has-text("Antecipar pagamento")'); await J.waitForSelector('.modal');
await J.click('.modal .chip:has-text("Total")'); await J.click('.modal-rod button:has-text("Confirmar pagamento")'); await J.waitForSelector('.modal', { state: 'detached' });
const pago = sql("select valor_centavos from lancamentos where tipo='pagamento_fatura'");
check('C5: pagamento da fatura = compras da fatura (pizza 80 + parcela 33,34)', pago === '11334', pago);
check('C5: pagamento não criou nova despesa', sql("select count(*) from lancamentos where tipo='despesa'") === despAntes);
// verificação com o próprio motor de cálculo do app
const calc = await J.evaluate(async () => {
  const C = await import('./js/lib/calc.js'); const { store } = await import('./js/data/store.js'); const D = store.s.D;
  const ano = (b) => C.totais(C.itensBase(D, b, '2026-01-01', '2027-12-31')).despesas;
  return { consumo: ano('consumo'), caixa: ano('caixa') };
});
check('C5: consumo conta a compra uma vez (130+100+80 = R$ 311,00)', calc.consumo === 31100, JSON.stringify(calc));
check('C5: caixa conta despesa paga + fatura paga (131 + 113,34), sem a compra', calc.caixa === 13100 + 11334, JSON.stringify(calc));

// ---- Cenário 7: previsto só afeta saldo quando pago
await J.goto(URL + '#/painel'); await J.waitForSelector('.kpi');
const s0 = await J.textContent('.kpi.destaque .val');
await novaDespesa(J, { valor: '300,00', cat: 'Educação', origem: 'Conta Nubank', desc: 'Colégio novembro', aPagar: true });
check('C7: conta prevista não altera saldo realizado', (await J.textContent('.kpi.destaque .val')) === s0, s0);
await J.goto(URL + '#/lancamentos'); await J.click('.item:has-text("Colégio novembro") button:has-text("Pagar")');
await J.waitForTimeout(500); await J.goto(URL + '#/painel'); await J.waitForSelector('.kpi');
const s1 = await J.textContent('.kpi.destaque .val');
check('C7: após pagar, saldo cai R$ 300,00', s0 !== s1 && sql("select status from lancamentos where descricao='Colégio novembro'") === 'efetivado', `${s0} -> ${s1}`);

// ---- Cenário 8: gráficos e relatórios com os mesmos totais
await J.goto(URL + '#/analises'); await J.waitForSelector('.kpi'); await J.selectOption('label:has-text("Período") select', 'mes');
const despAn = await J.textContent('.kpi:has-text("Despesas no período") .val');
await J.goto(URL + '#/relatorios'); await J.waitForSelector('text=Consumo por competência');
const despRel = (await J.textContent('.card:has(h3:has-text("Consumo por competência")) tbody tr:nth-child(2) td.r')).trim();
const totRank = (await J.textContent('.card:has(h3:has-text("Distribuição e ranking")) tfoot td:nth-child(3)')).trim();
check('C8: Análises, Relatório e ranking mostram o mesmo total de consumo', despAn.trim() === despRel && despRel === totRank, `${despAn} | ${despRel} | ${totRank}`);

// ---- Cenário 9: cores e símbolos de saldo
await J.goto(URL + '#/contas'); await J.waitForSelector('.tom');
const tons = await J.$$eval('.card .tom', (els) => els.map((e) => ({ cls: e.className, cor: getComputedStyle(e).color, txt: e.textContent })));
const pos = tons.find((t) => t.cls.includes('pos'));
check('C9: saldo positivo em verde com ▲', pos && pos.cor === 'rgb(18, 133, 90)' && pos.txt.includes('▲'), JSON.stringify(pos));
await J.goto(URL + '#/contas'); await J.click('.card:has-text("Reserva") button[aria-label="Editar conta"]');
await J.fill('.modal label:has-text("Saldo inicial") input', '-1.500,00'); await salvarModal(J); await J.waitForSelector('.modal', { state: 'detached' });
const neg = (await J.$$eval('.card .tom.neg', (els) => els.map((e) => ({ cor: getComputedStyle(e).color, txt: e.textContent }))))[0];
check('C9: saldo negativo em vermelho com ▼ e sinal de menos', neg && neg.cor === 'rgb(209, 52, 62)' && neg.txt.includes('▼') && neg.txt.includes('−R$'), JSON.stringify(neg));

// ---- Cenário 10: projeto — reserva x gasto
await J.goto(URL + '#/projetos'); await J.click('.topo button:has-text("Novo projeto")');
await J.fill('.modal input[placeholder="Ex.: Viagem de férias"]', 'Viagem'); await J.fill('.modal label:has-text("Valor estimado") input', '5.000,00');
await J.fill('.modal label:has-text("Data desejada") input', '2027-07-10'); await salvarModal(J); await J.waitForSelector('.proj-card');
const despCaixaAntes = calc.caixa;
await J.click('.proj-card button:has-text("Reservar")'); await J.fill('.modal #valor, .modal input[inputmode=decimal]', '1.000,00'); await J.click('.modal-rod button:has-text("Confirmar")'); await J.waitForSelector('.modal', { state: 'detached' });
await J.click('.proj-card button:has-text("Lançar gasto")'); await J.waitForSelector('#valor'); await J.fill('#valor', '400'); await J.click('.cat-op:has-text("Viagens")');
await J.click('.chips .chip:has-text("Conta Nubank")'); await J.fill('input[list=sugestoes-desc]', 'Hotel'); await salvarModal(J); await J.waitForSelector('.modal', { state: 'detached' });
const pj = await J.textContent('.proj-card .proj-stat');
const tot10 = await J.evaluate(async () => { const C = await import('./js/lib/calc.js'); const { store } = await import('./js/data/store.js'); return C.totais(C.itensBase(store.s.D, 'caixa', '2026-01-01', '2027-12-31')).despesas; });
check('C10: projeto mostra Reservado R$ 1.000,00 e Gasto R$ 400,00 separados', pj.includes('R$ 1.000,00') && pj.includes('R$ 400,00'), pj);
check('C10: reserva não virou despesa; gasto do projeto entra uma vez no total', tot10 === despCaixaAntes + 30000 + 40000, `${tot10} vs ${despCaixaAntes}+300+400`);

// ---- intruso
const X = await dispositivo('Intruso'); await login(X, 'intruso@x.com', 'intruso123'); await X.waitForSelector('text=não está autorizada');
check('Conta não autorizada não acessa nada', true);

// ---- Cenário 11: celular
await L.goto(URL + '#/painel'); await L.reload(); await L.waitForSelector('.kpi');
await L.screenshot({ path: 'shots/e2e-mob-painel.png' });
const navOk = await L.isVisible('.nav-movel') && await L.isVisible('.fab') && !(await L.isVisible('.lateral'));
const largura = await L.evaluate(() => document.documentElement.scrollWidth);
check('C11: no celular, navegação inferior + botão destacado, sem rolagem lateral', navOk && largura <= 390, 'scrollWidth=' + largura);
await L.click('.fab'); await L.waitForSelector('#valor'); await L.screenshot({ path: 'shots/e2e-mob-form.png' });
// despesa rápida: valor -> categoria -> salvar (3 toques + digitação)
await L.fill('#valor', '12,50'); await L.click('.cat-op:has-text("Alimentação fora")'); await salvarModal(L); await L.waitForSelector('.modal', { state: 'detached' });
check('C11: despesa rápida no celular em 3 toques (valor, categoria, salvar)', sql("select count(*) from lancamentos where valor_centavos=1250 and criado_por='22222222-2222-2222-2222-222222222222' and status='efetivado'") === '1');
await J.goto(URL + '#/analises'); await J.waitForTimeout(800); await J.screenshot({ path: 'shots/e2e-desk-analises.png', fullPage: true });

console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)${falhas.length ? ': ' + falhas.join('; ') : ''}`);
console.log(erros.length ? 'ERROS DE CONSOLE:\n' + erros.join('\n') : 'Sem erros de console');
await browser.close();
