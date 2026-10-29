import assert from 'node:assert/strict';
import * as C from '../js/lib/calc.js';
import * as F from '../js/lib/fmt.js';

let n = 0;
const t = (nome, fn) => { fn(); n++; console.log('✓', nome); };

const base = () => C.indexar({
  lancamentos: [], contas: [{ id: 'c1', nome: 'Corrente', saldo_inicial_centavos: 100000, data_referencia: '2026-10-01' },
    { id: 'c2', nome: 'Reserva', saldo_inicial_centavos: 0, data_referencia: '2026-10-01' }],
  cartoes: [{ id: 'k1', nome: 'Visa', limite_centavos: 500000, dia_fechamento: 25, dia_vencimento: 5 }],
  categorias: [{ id: 'mer', tipo: 'despesa', nome: 'Supermercado', cor: '#16A34A', icone: 'shopping-cart' }, { id: 'sal', tipo: 'receita', nome: 'Salários' }],
  pessoas: [], projetos: [], perfis: [], metas: [], recorrencias: [], aportes: [], orcamentos: [], tarefas: [], config: {},
});
let seq = 0;
const L = (o) => ({ id: 'l' + (++seq), status: 'efetivado', etiquetas: [], competencia: (o.data_ocorrencia || '2026-10-10').slice(0, 7) + '-01', data_ocorrencia: '2026-10-10', ...o });

t('formatação BRL e datas', () => {
  assert.equal(F.brl(125090), 'R$ 1.250,90');
  assert.equal(F.brl(-5000), '−R$ 50,00');
  assert.equal(F.parseValor('1.250,90'), 125090);
  assert.equal(F.parseValor('1250,9'), 125090);
  assert.equal(F.parseValor('12'), 1200);
  assert.equal(F.parseValor('abc'), null);
  assert.equal(F.dataBR('2026-11-15'), '15/11/2026');
  assert.equal(F.parseData('31/02/2026'), null);
  assert.equal(F.dataHoraBR('2026-11-15T17:30:00Z'), '15/11/2026 às 14h30');
  assert.equal(F.addMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(F.variacao(100, 0), null);
});

t('parcelas somam exatamente o valor (cenário 6)', () => {
  for (const [tot, n] of [[10000, 3], [99999, 7], [1, 3], [125090, 12], [3333, 10]]) {
    const p = C.dividirParcelas(tot, n);
    assert.equal(p.length, n);
    assert.equal(p.reduce((a, b) => a + b, 0), tot);
    assert.ok(Math.max(...p) - Math.min(...p) <= 1);
  }
});

t('fatura correta conforme fechamento', () => {
  const k = { dia_fechamento: 25, dia_vencimento: 5 };
  assert.equal(C.faturaDaCompra(k, '2026-10-24'), '2026-11-01');
  assert.equal(C.faturaDaCompra(k, '2026-10-25'), '2026-12-01');
  const k2 = { dia_fechamento: 3, dia_vencimento: 10 };
  assert.equal(C.faturaDaCompra(k2, '2026-10-02'), '2026-10-01');
  assert.equal(C.faturaDaCompra(k2, '2026-10-03'), '2026-11-01');
  assert.deepEqual(C.datasFatura(k, '2026-11-01'), { fechamento: '2026-10-25', vencimento: '2026-11-05' });
  const k3 = { dia_fechamento: 31, dia_vencimento: 8 };
  assert.equal(C.faturaDaCompra(k3, '2026-02-28'), '2026-04-01'); // fecha 28/02 (clamp) -> compra no dia vai p/ próxima
});

t('transferência não altera resultado e preserva saldo consolidado (cenário 4)', () => {
  const D = base();
  D.lancamentos.push(L({ tipo: 'transferencia', descricao: 'Guardar', valor_centavos: 30000, conta_id: 'c1', conta_destino_id: 'c2', data_efetiva: '2026-10-10' }));
  C.indexar(D);
  for (const b of ['consumo', 'caixa']) assert.deepEqual(C.totaisMes(D, b, '2026-10'), { receitas: 0, despesas: 0, resultado: 0, qtdDespesas: 0 });
  assert.equal(C.saldoConta(D, D.contas[0]), 70000);
  assert.equal(C.saldoConta(D, D.contas[1]), 30000);
  assert.equal(C.saldoConsolidado(D), 100000);
});

t('compra no cartão + pagamento da fatura não duplicam (cenário 5)', () => {
  const D = base();
  const fat = C.faturaDaCompra(D.cartoes[0], '2026-10-10'); // 2026-11
  D.lancamentos.push(L({ tipo: 'despesa', descricao: 'Mercado', valor_centavos: 50000, cartao_id: 'k1', fatura: fat, categoria_id: 'mer', data_efetiva: '2026-10-10' }));
  D.lancamentos.push(L({ tipo: 'pagamento_fatura', descricao: 'Fatura', valor_centavos: 50000, conta_id: 'c1', cartao_id: 'k1', fatura: fat, data_ocorrencia: '2026-11-05', data_efetiva: '2026-11-05' }));
  C.indexar(D);
  // consumo: compra em outubro; pagamento não entra
  assert.equal(C.totaisMes(D, 'consumo', '2026-10').despesas, 50000);
  assert.equal(C.totaisMes(D, 'consumo', '2026-11').despesas, 0);
  // caixa: compra não entra; pagamento em novembro
  assert.equal(C.totaisMes(D, 'caixa', '2026-10').despesas, 0);
  assert.equal(C.totaisMes(D, 'caixa', '2026-11').despesas, 50000);
  // soma no ano = uma vez só, em cada base
  const ano = (b) => C.totais(C.itensBase(D, b, '2026-01-01', '2026-12-31')).despesas;
  assert.equal(ano('consumo'), 50000); assert.equal(ano('caixa'), 50000);
  const r = C.resumoFatura(D, D.cartoes[0], fat, '2026-11-06');
  assert.equal(r.aberto, 0); assert.equal(r.status, 'paga');
  assert.equal(C.limiteCartao(D, D.cartoes[0]).disponivel, 500000);
  assert.equal(C.saldoConta(D, D.contas[0]), 50000);
  // gráfico de consumo usa categoria da compra
  const g = C.agrupar(D, C.itensBase(D, 'consumo', '2026-10-01', '2026-10-31'));
  assert.equal(g.grupos[0].rotulo, 'Supermercado');
});

t('previsto só afeta saldo quando pago (cenário 7)', () => {
  const D = base();
  const l = L({ tipo: 'despesa', descricao: 'Colégio', valor_centavos: 80000, conta_id: 'c1', status: 'previsto', vencimento: '2026-10-20', data_efetiva: null });
  D.lancamentos.push(l); C.indexar(D);
  assert.equal(C.saldoConsolidado(D, '2026-10-28'), 100000);
  assert.equal(C.projecaoFimMes(D, '2026-10', '2026-10-15').valor, 20000);
  l.status = 'efetivado'; l.data_efetiva = '2026-10-20';
  assert.equal(C.saldoConsolidado(D, '2026-10-28'), 20000);
  assert.equal(C.saldoConsolidado(D, '2026-10-19'), 100000);
});

t('reembolso reduz a despesa e não vira receita', () => {
  const D = base();
  D.lancamentos.push(L({ id: 'orig', tipo: 'despesa', descricao: 'Tênis', valor_centavos: 30000, conta_id: 'c1', categoria_id: 'mer', data_efetiva: '2026-10-10' }));
  D.lancamentos.push(L({ tipo: 'reembolso', descricao: 'Estorno tênis', valor_centavos: 30000, conta_id: 'c1', categoria_id: 'mer', origem_id: 'orig', data_efetiva: '2026-10-12' }));
  C.indexar(D);
  const tt = C.totaisMes(D, 'caixa', '2026-10');
  assert.equal(tt.receitas, 0); assert.equal(tt.despesas, 0);
  assert.equal(C.saldoConsolidado(D), 100000);
});

t('recorrências geram previsões sem marcar pago', () => {
  const D = base();
  D.recorrencias.push({ id: 'r1', ativa: true, tipo: 'despesa', descricao: 'Academia', valor_centavos: 9990, conta_id: 'c1', frequencia: 'mensal', inicio: '2026-01-31', fim: '2026-05-31' });
  C.indexar(D);
  const p = C.recorrenciasPendentes(D, '2026-12-31');
  assert.deepEqual(p.map((x) => x.data_ocorrencia), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.ok(p.every((x) => x.status === 'previsto'));
  D.lancamentos.push({ ...p[0], id: 'x', excluido_em: '2026-01-01' }); // excluída: não recria
  assert.equal(C.recorrenciasPendentes(D, '2026-12-31').length, 4);
  const q = { id: 'r2', inicio: '2026-10-01', frequencia: 'quinzenal' };
  assert.deepEqual(C.ocorrencias(q, '2026-11-01').map((o) => o.data), ['2026-10-01', '2026-10-15', '2026-10-29']);
});

t('projeto: reserva e gasto separados, sem duplicidade (cenário 10)', () => {
  const D = base();
  D.projetos.push({ id: 'p1', nome: 'Viagem', valor_estimado_centavos: 1000000, data_alvo: '2027-04-30', status: 'andamento' });
  D.aportes.push({ projeto_id: 'p1', tipo: 'aporte', valor_centavos: 300000 });
  C.indexar(D);
  let r = C.resumoProjeto(D, D.projetos[0], '2026-10-28');
  assert.equal(r.reservado, 300000); assert.equal(r.gasto, 0); assert.equal(r.falta, 700000);
  assert.equal(C.totaisMes(D, 'caixa', '2026-10').despesas, 0); // reserva não é despesa
  D.lancamentos.push(L({ tipo: 'despesa', descricao: 'Passagens', valor_centavos: 200000, conta_id: 'c1', projeto_id: 'p1', data_efetiva: '2026-10-10' }));
  C.indexar(D);
  r = C.resumoProjeto(D, D.projetos[0], '2026-10-28');
  assert.equal(r.gasto, 200000); assert.equal(r.reservado, 300000); assert.equal(r.coberto, 300000); assert.equal(r.saldoReserva, 100000);
  assert.equal(C.totaisMes(D, 'caixa', '2026-10').despesas, 200000); // gasto conta uma vez no total geral
  assert.ok(r.porMes > 0);
});

t('orçamento: específico do mês prevalece sobre padrão', () => {
  const D = base();
  D.orcamentos.push({ id: 'o1', categoria_id: 'mer', mes: null, valor_centavos: 100000 }, { id: 'o2', categoria_id: 'mer', mes: '2026-12-01', valor_centavos: 150000 });
  D.lancamentos.push(L({ tipo: 'despesa', descricao: 'M', valor_centavos: 85000, conta_id: 'c1', categoria_id: 'mer', data_efetiva: '2026-10-10' }));
  D.config = { alerta_atencao_pct: 80, alerta_limite_pct: 100 }; C.indexar(D);
  assert.equal(C.orcamentoDoMes(D, '2026-12', 'mer').valor, 150000);
  const s = C.statusOrcamento(D, '2026-10');
  assert.equal(s.linhas[0].nivel, 'atencao');
});

t('gráficos e totais conferem para os mesmos filtros (cenário 8)', () => {
  const D = base();
  for (let i = 1; i <= 20; i++) D.lancamentos.push(L({ tipo: 'despesa', descricao: 'x' + i, valor_centavos: 1000 * i + 7, conta_id: 'c1', categoria_id: i % 2 ? 'mer' : null, data_ocorrencia: `2026-10-${String(i).padStart(2, '0')}`, data_efetiva: `2026-10-${String(i).padStart(2, '0')}` }));
  C.indexar(D);
  for (const b of ['consumo', 'caixa']) {
    const it = C.itensBase(D, b, '2026-10-01', '2026-10-31');
    const tot = C.totais(it).despesas;
    assert.equal(C.agrupar(D, it).total, tot);
    assert.equal(C.serieTemporal(it, '2026-10-01', '2026-10-31', 'dia').vals.reduce((a, b) => a + b, 0), tot);
    assert.equal(C.serieTemporal(it, '2026-10-01', '2026-10-31', 'semana').vals.reduce((a, b) => a + b, 0), tot);
    assert.equal(C.serieTemporal(it, '2026-10-01', '2026-10-31', 'mes').vals[0], tot);
  }
});

console.log(`\n${n} testes OK`);
