// Indicadores de saúde financeira (funções puras). Valores em centavos.
import * as C from './calc.js';
import { primeiroDia, ultimoDia, addMesYM } from './fmt.js';

const nivel = (n, rot) => ({ n, rot }); // n: 'otimo' | 'bom' | 'atencao' | 'critico' | 'neutro'

/**
 * Calcula os indicadores do período [ini, fim] (base de consumo: cartão conta na data da compra).
 * Devolve números + classificação + frases de pontos fortes, de atenção e sugestões.
 */
export function saudeFinanceira(D, ini, fim, hoje, f = {}) {
  const itens = C.itensBase(D, 'consumo', ini, fim, f);
  const tot = C.totais(itens);
  // meses com algum movimento (evita diluir a média em meses anteriores ao uso da plataforma)
  const nMeses = Math.max(1, new Set(itens.map((it) => it.data.slice(0, 7))).size);
  const recMedia = Math.round(tot.receitas / nMeses), gastoMedio = Math.round(tot.despesas / nMeses);

  // 1. Taxa de poupança
  const taxa = tot.receitas > 0 ? (tot.resultado / tot.receitas) * 100 : null;
  const iPoup = taxa == null ? nivel('neutro', 'Sem receitas no período')
    : taxa >= 20 ? nivel('otimo', 'Ótima') : taxa >= 10 ? nivel('bom', 'Boa') : taxa >= 0 ? nivel('atencao', 'Apertada') : nivel('critico', 'Gastos maiores que as receitas');

  // 2. Juros e encargos pagos (subcategorias de juros/encargos)
  // Parte de juros: campo juros_centavos (parcelamentos) ou lançamentos de juros/IOF inteiros.
  const jurosDe = (it) => {
    const l = it.l;
    if (l.juros_centavos > 0) return Math.min(l.juros_centavos, C.valorDespesa(it));
    return /^juros/i.test(D.mapa.categorias[l.subcategoria_id]?.nome || '') || /juros|iof/i.test(l.descricao || '') ? C.valorDespesa(it) : 0;
  };
  const juros = itens.filter((it) => C.valorDespesa(it) > 0).reduce((s, it) => s + jurosDe(it), 0);
  const pJuros = tot.receitas > 0 ? (juros / tot.receitas) * 100 : null;
  const iJuros = juros === 0 ? nivel('otimo', 'Nenhum juro pago') : pJuros != null && pJuros < 2 ? nivel('atencao', 'Pouco, mas evitável') : nivel('critico', 'Alto');

  // 3. Uso do limite dos cartões (hoje)
  const cartoes = D.cartoes.filter((c) => !c.arquivado).map((c) => ({ c, ...C.limiteCartao(D, c, hoje) }));
  const limTot = cartoes.reduce((s, x) => s + x.limite, 0), usado = cartoes.reduce((s, x) => s + x.comprometido, 0);
  const pLim = limTot > 0 ? (usado / limTot) * 100 : null;
  const iLim = pLim == null ? nivel('neutro', 'Sem cartões') : pLim <= 30 ? nivel('otimo', 'Saudável') : pLim <= 60 ? nivel('bom', 'Moderado') : pLim <= 90 ? nivel('atencao', 'Alto') : nivel('critico', 'Estourado ou quase');

  // 4. Dívida no cartão (faturas futuras) comparada à receita mensal
  const faturas = C.faturasEmAberto(D, hoje);
  const dividaCartao = faturas.reduce((s, x) => s + x.devido, 0);
  const mesesDivida = recMedia > 0 ? dividaCartao / recMedia : null;
  const iDiv = dividaCartao === 0 ? nivel('otimo', 'Sem faturas em aberto') : mesesDivida == null ? nivel('neutro', '—')
    : mesesDivida <= 0.5 ? nivel('bom', 'Controlada') : mesesDivida <= 1 ? nivel('atencao', 'Pesada') : nivel('critico', 'Maior que a receita do mês');

  // 5. Reserva: saldo em contas ÷ gasto médio mensal
  const saldo = C.saldoConsolidado(D, hoje);
  const mesesReserva = gastoMedio > 0 ? saldo / gastoMedio : null;
  const iRes = mesesReserva == null ? nivel('neutro', '—') : mesesReserva >= 6 ? nivel('otimo', 'Reserva sólida') : mesesReserva >= 3 ? nivel('bom', 'Razoável')
    : mesesReserva >= 1 ? nivel('atencao', 'Curta') : nivel('critico', 'Sem reserva');

  // 6. Parcelamentos em andamento
  const compras = [...new Set(C.vivos(D).filter((l) => l.compra_id && l.cartao_id).map((l) => l.compra_id))]
    .map((id) => C.restanteCompra(D, id, hoje)).filter((x) => x.restante > 0);
  const restanteParc = compras.reduce((s, x) => s + x.restante, 0);

  // 7. Orçamento do último mês do período
  const orc = C.statusOrcamento(D, fim.slice(0, 7));
  const estourados = orc.linhas.filter((l) => l.nivel === 'estourado');

  // 8. Concentração dos gastos
  const porCat = C.rankingValor(C.agrupar(D, itens, 'categoria').grupos);
  const top = porCat[0];

  const indicadores = [
    { id: 'poupanca', titulo: 'Quanto sobra da renda', valor: taxa == null ? '—' : `${taxa.toFixed(1).replace('.', ',')}%`, ...iPoup,
      explica: 'Parte das receitas que não foi gasta. Referência: guardar pelo menos 10% a 20%.' },
    { id: 'juros', titulo: 'Juros e encargos pagos', valor: juros, moeda: true, ...iJuros,
      explica: pJuros == null ? 'Juros de parcelamento de fatura, Pix no crédito, rotativo e atraso.' : `Equivale a ${pJuros.toFixed(1).replace('.', ',')}% das receitas do período. Juros de cartão estão entre os mais caros do mercado.` },
    { id: 'limite', titulo: 'Uso do limite dos cartões', valor: pLim == null ? '—' : `${pLim.toFixed(0)}%`, ...iLim,
      explica: limTot ? `Comprometido hoje em todos os cartões em relação ao limite somado. Ideal: até 30%.` : '' },
    { id: 'divida', titulo: 'Faturas a pagar × receita do mês', valor: mesesDivida == null ? '—' : `${(mesesDivida * 100).toFixed(0)}%`, ...iDiv,
      explica: 'Soma das faturas em aberto (atual e futuras) em relação à receita média de um mês.' },
    { id: 'reserva', titulo: 'Reserva em conta', valor: mesesReserva == null ? '—' : `${Math.max(0, mesesReserva).toFixed(1).replace('.', ',')} mês(es)`, ...iRes,
      explica: 'Saldo atual das contas dividido pelo gasto médio mensal. Referência: de 3 a 6 meses de gastos.' },
  ];

  const pontos = { fortes: [], atencao: [], sugestoes: [] };
  if (taxa != null && taxa >= 10) pontos.fortes.push(`Sobrou ${taxa.toFixed(0)}% das receitas no período.`);
  if (taxa != null && taxa < 0) pontos.atencao.push(`Os gastos passaram as receitas em ${brlS(-tot.resultado)} no período.`);
  if (juros > 0) { pontos.atencao.push(`Foram pagos ${brlS(juros)} em juros e encargos.`); pontos.sugestoes.push('Priorize quitar parcelamentos e evitar Pix no crédito ou rotativo: é o dinheiro que mais rende ao ser economizado.'); }
  else pontos.fortes.push('Nenhum juro ou encargo pago no período.');
  if (pLim != null && pLim > 60) { pontos.atencao.push(`Os cartões estão com ${pLim.toFixed(0)}% do limite comprometido.`); pontos.sugestoes.push('Evite novas compras parceladas até o limite comprometido baixar.'); }
  if (dividaCartao > 0 && mesesDivida != null && mesesDivida > 0.5) pontos.atencao.push(`As faturas a pagar somam ${brlS(dividaCartao)}, ${(mesesDivida * 100).toFixed(0)}% de uma receita mensal.`);
  if (restanteParc > 0) pontos.atencao.push(`Ainda faltam ${brlS(restanteParc)} em parcelas no cartão (${compras.length} parcelamento(s)).`);
  if (mesesReserva != null && mesesReserva < 3) pontos.sugestoes.push('Monte uma reserva de emergência: separe um valor fixo todo mês assim que a renda entrar.');
  if (mesesReserva != null && mesesReserva >= 3) pontos.fortes.push(`O saldo em conta cobre ${mesesReserva.toFixed(1).replace('.', ',')} mês(es) de gastos.`);
  if (estourados.length) { pontos.atencao.push(`Orçamento estourado em: ${estourados.map((l) => l.categoria.nome).join(', ')}.`); pontos.sugestoes.push('Revise os limites do orçamento das categorias que estouraram ou corte gastos nelas no próximo mês.'); }
  if (top && tot.despesas > 0 && top.pct >= 35) pontos.atencao.push(`${top.rotulo} concentra ${top.pct.toFixed(0)}% dos gastos.`);
  if (taxa != null && taxa >= 0 && taxa < 10) pontos.sugestoes.push('Tente separar pelo menos 10% das receitas no início do mês, antes de gastar.');

  // Nota geral (0–100)
  const peso = { otimo: 100, bom: 75, atencao: 45, critico: 10 };
  const vals = indicadores.filter((i) => peso[i.n] != null).map((i) => peso[i.n]);
  const nota = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  const notaRot = nota == null ? '—' : nota >= 80 ? 'Saudável' : nota >= 60 ? 'Estável, com pontos a melhorar' : nota >= 40 ? 'Em atenção' : 'Crítica';

  return { tot, nMeses, recMedia, gastoMedio, juros, saldo, limTot, usado, cartoes, faturas, dividaCartao, compras, restanteParc, estourados, indicadores, pontos, nota, notaRot, itens };
}

const brlS = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const mesesDoPeriodo = (ini, fim) => { const out = []; for (let ym = ini.slice(0, 7); ym <= fim.slice(0, 7); ym = addMesYM(ym, 1)) out.push(ym); return out; };
export { primeiroDia, ultimoDia };
