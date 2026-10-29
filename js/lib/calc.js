// Núcleo de cálculo financeiro. Funções puras sobre o retrato dos dados (D).
// Todos os valores em CENTAVOS (inteiros). Datas em "YYYY-MM-DD".
//
// Duas bases, nunca misturadas no mesmo indicador:
//  * 'consumo' (competência): compras e parcelas atribuídas ao período, inclusive no cartão.
//    Pagamento de fatura NÃO entra (senão a compra seria contada duas vezes).
//  * 'caixa' (fluxo de caixa): dinheiro que efetivamente entrou/saiu das contas.
//    Compra no cartão NÃO entra; o pagamento da fatura entra.
// Transferências entre contas não entram em nenhuma das duas (só movem saldo).
// Aportes em metas/projetos são reservas, não despesas.

import { addMesYM, addMeses, addDias, diasNoMes, ultimoDia, primeiroDia, ymDe, difMeses, normalizar } from './fmt.js';

export const vivos = (D) => D.lancamentos.filter((l) => !l.excluido_em);
export const BASES = {
  consumo: { nome: 'Consumo por competência', curto: 'Competência', desc: 'Compras e parcelas atribuídas ao período (inclui cartão; não inclui pagamento de fatura).' },
  caixa: { nome: 'Fluxo de caixa', curto: 'Caixa', desc: 'Dinheiro efetivamente recebido ou pago nas contas (inclui pagamento de fatura; não inclui compras no cartão).' },
};

// ------------------------------------------------------------------ parcelas
/** Divide um total em n parcelas que somam EXATAMENTE o total (centavos restantes nas primeiras). */
export function dividirParcelas(total, n) {
  total = Math.round(total); n = Math.max(1, Math.floor(n));
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

// ------------------------------------------------------------------ cartão
const clampDia = (ym, dia) => {
  const [y, m] = ym.split('-').map(Number);
  return Math.min(dia, diasNoMes(y, m));
};
/** Mês (YYYY-MM-01) da fatura em que cai uma compra feita em `data`.
 *  Compras no dia do fechamento ou depois vão para a fatura seguinte. A fatura é identificada pelo mês do vencimento. */
export function faturaDaCompra(cartao, data) {
  const ym = data.slice(0, 7);
  const dia = Number(data.slice(8, 10));
  const ymFech = dia >= clampDia(ym, cartao.dia_fechamento) ? addMesYM(ym, 1) : ym;
  const ymFat = cartao.dia_vencimento > cartao.dia_fechamento ? ymFech : addMesYM(ymFech, 1);
  return primeiroDia(ymFat);
}
export function datasFatura(cartao, fatura) {
  const ymFat = fatura.slice(0, 7);
  const ymFech = cartao.dia_vencimento > cartao.dia_fechamento ? ymFat : addMesYM(ymFat, -1);
  const p = (ym, d) => `${ym}-${String(clampDia(ym, d)).padStart(2, '0')}`;
  return { fechamento: p(ymFech, cartao.dia_fechamento), vencimento: p(ymFat, cartao.dia_vencimento) };
}
/** Fatura que está aberta (recebendo compras) na data informada. */
export const faturaAtual = (cartao, hoje) => faturaDaCompra(cartao, hoje);

export function resumoFatura(D, cartao, fatura, hoje) {
  const itens = vivos(D).filter((l) => l.cartao_id === cartao.id && l.fatura === fatura && l.status !== 'cancelado');
  let compras = 0, previstas = 0, creditos = 0, pagamentos = 0;
  for (const l of itens) {
    if (l.tipo === 'despesa') { if (l.status === 'efetivado') compras += l.valor_centavos; else previstas += l.valor_centavos; }
    else if (l.tipo === 'reembolso' && l.status === 'efetivado') creditos += l.valor_centavos;
    else if (l.tipo === 'pagamento_fatura' && l.status === 'efetivado') pagamentos += l.valor_centavos;
  }
  const total = compras - creditos;
  const aberto = total - pagamentos;
  const { fechamento, vencimento } = datasFatura(cartao, fatura);
  let status;
  if (hoje < fechamento) status = 'aberta';
  else if (aberto <= 0) status = total > 0 || pagamentos > 0 ? 'paga' : 'sem_movimento';
  else if (hoje > vencimento) status = 'vencida';
  else status = 'fechada';
  if (status === 'aberta' && total === 0 && previstas === 0 && pagamentos === 0) status = 'sem_movimento_aberta';
  return { cartao, fatura, itens, compras, previstas, creditos, pagamentos, total, aberto, fechamento, vencimento, status };
}
/** Todas as faturas com algum movimento + a atual + as 2 seguintes. */
export function faturasDoCartao(D, cartao, hoje) {
  const set = new Set();
  for (const l of vivos(D)) if (l.cartao_id === cartao.id && l.fatura) set.add(l.fatura);
  const atual = faturaAtual(cartao, hoje);
  set.add(atual); set.add(primeiroDia(addMesYM(atual.slice(0, 7), 1)));
  return [...set].sort().map((f) => resumoFatura(D, cartao, f, hoje));
}
export function limiteCartao(D, cartao) {
  let comprometido = 0;
  for (const l of vivos(D)) {
    if (l.cartao_id !== cartao.id || l.status !== 'efetivado') continue;
    if (l.tipo === 'despesa') comprometido += l.valor_centavos;
    else if (l.tipo === 'reembolso' || l.tipo === 'pagamento_fatura') comprometido -= l.valor_centavos;
  }
  comprometido = Math.max(0, comprometido);
  return { limite: cartao.limite_centavos, comprometido, disponivel: cartao.limite_centavos - comprometido };
}
/** Saldo restante de uma compra parcelada (parcelas em faturas ainda não vencidas). */
export function restanteCompra(D, compraId, hoje) {
  const ps = vivos(D).filter((l) => l.compra_id === compraId && l.status !== 'cancelado').sort((a, b) => a.parcela_num - b.parcela_num);
  const total = ps.reduce((s, l) => s + l.valor_centavos, 0);
  let restante = 0, restantes = 0;
  for (const l of ps) {
    const venc = l.cartao_id ? datasFatura(D.mapa.cartoes[l.cartao_id] || { dia_fechamento: 1, dia_vencimento: 10 }, l.fatura).vencimento : (l.vencimento || l.data_ocorrencia);
    const quitada = l.cartao_id ? venc < hoje : l.status === 'efetivado';
    if (!quitada) { restante += l.valor_centavos; restantes++; }
  }
  return { parcelas: ps, total, restante, restantes };
}

// ------------------------------------------------------------------ saldos
export function efeitoNaConta(l, contaId) {
  const v = l.valor_centavos;
  switch (l.tipo) {
    case 'receita': return l.conta_id === contaId ? v : 0;
    case 'despesa': return l.conta_id === contaId ? -v : 0;
    case 'reembolso': return l.conta_id === contaId ? v : 0;
    case 'pagamento_fatura': return l.conta_id === contaId ? -v : 0;
    case 'transferencia': return (l.conta_id === contaId ? -v : 0) + (l.conta_destino_id === contaId ? v : 0);
    default: return 0;
  }
}
/** Saldo realizado: saldo inicial + movimentos EFETIVADOS desde a data de referência até `ate` (inclusive). Previstos não contam. */
export function saldoConta(D, conta, ate) {
  let s = conta.saldo_inicial_centavos;
  for (const l of vivos(D)) {
    if (l.status !== 'efetivado' || !l.data_efetiva) continue;
    if (l.data_efetiva < conta.data_referencia) continue;
    if (ate && l.data_efetiva > ate) continue;
    s += efeitoNaConta(l, conta.id);
  }
  return s;
}
export const saldoConsolidado = (D, ate) => D.contas.reduce((s, c) => s + saldoConta(D, c, ate), 0);

// ------------------------------------------------------------------ filtros
export function passaFiltro(l, f = {}, D) {
  if (f.categoria_id && l.categoria_id !== f.categoria_id) return false;
  if (f.subcategoria_id && l.subcategoria_id !== f.subcategoria_id) return false;
  if (f.conta_id && l.conta_id !== f.conta_id && l.conta_destino_id !== f.conta_id) return false;
  if (f.cartao_id && l.cartao_id !== f.cartao_id) return false;
  if (f.status && l.status !== f.status) return false;
  if (f.tipo && l.tipo !== f.tipo) return false;
  if (f.criado_por && l.criado_por !== f.criado_por) return false;
  if (f.pagador_id && l.pagador_id !== f.pagador_id) return false;
  if (f.beneficiario_id && l.beneficiario_id !== f.beneficiario_id) return false;
  if (f.projeto_id && l.projeto_id !== f.projeto_id) return false;
  if (f.etiqueta && !(l.etiquetas || []).includes(f.etiqueta)) return false;
  if (f.busca) {
    const q = normalizar(f.busca);
    const cat = D?.mapa?.categorias?.[l.categoria_id]?.nome;
    const sub = D?.mapa?.categorias?.[l.subcategoria_id]?.nome;
    const alvo = normalizar([l.descricao, l.favorecido, l.observacoes, (l.etiquetas || []).join(' '), cat, sub].join(' '));
    if (!alvo.includes(q)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ bases
/** Data em que um lançamento entra na base de consumo (sempre dentro do mês de competência). */
export function dataConsumo(l) {
  return ymDe(l.data_ocorrencia) === ymDe(l.competencia) ? l.data_ocorrencia : l.competencia;
}
/**
 * Itens de uma base no intervalo [ini, fim].
 * Retorna { l, data, natureza, valor } com valor positivo; natureza:
 *  'receita' | 'despesa' | 'reembolso' (reduz despesa) | 'fatura' (só caixa).
 */
export function itensBase(D, base, ini, fim, f = {}, { incluirPrevistos = false } = {}) {
  const out = [];
  for (const l of vivos(D)) {
    if (l.status === 'cancelado') continue;
    if (l.status === 'previsto' && !incluirPrevistos) continue;
    if (!passaFiltro(l, f, D)) continue;
    let data, natureza;
    if (base === 'consumo') {
      if (l.tipo === 'despesa') natureza = 'despesa';
      else if (l.tipo === 'reembolso') natureza = 'reembolso';
      else if (l.tipo === 'receita') natureza = 'receita';
      else continue; // transferência e pagamento de fatura não são consumo
      data = dataConsumo(l);
    } else {
      if (l.tipo === 'despesa' && l.conta_id) natureza = 'despesa';
      else if (l.tipo === 'reembolso' && l.conta_id) natureza = 'reembolso';
      else if (l.tipo === 'receita') natureza = 'receita';
      else if (l.tipo === 'pagamento_fatura') natureza = 'fatura';
      else continue; // compra no cartão (sem caixa) e transferências
      data = l.status === 'efetivado' ? l.data_efetiva : (l.vencimento || l.data_ocorrencia);
    }
    if (!data || data < ini || data > fim) continue;
    out.push({ l, data, natureza, valor: l.valor_centavos });
  }
  return out;
}
export const valorDespesa = (it) => (it.natureza === 'despesa' || it.natureza === 'fatura' ? it.valor : it.natureza === 'reembolso' ? -it.valor : 0);
export const valorReceita = (it) => (it.natureza === 'receita' ? it.valor : 0);

export function totais(itens) {
  let receitas = 0, despesas = 0, qtdDespesas = 0;
  for (const it of itens) {
    receitas += valorReceita(it);
    const d = valorDespesa(it);
    despesas += d;
    if (it.natureza === 'despesa') qtdDespesas++;
  }
  return { receitas, despesas, resultado: receitas - despesas, qtdDespesas };
}
export function totaisMes(D, base, ym, f) {
  return totais(itensBase(D, base, primeiroDia(ym), ultimoDia(ym), f));
}

/** Agrupa despesas por categoria-mãe (ou subcategoria / favorecido). */
export function agrupar(D, itens, por = 'categoria') {
  const g = new Map();
  let total = 0;
  for (const it of itens) {
    const v = valorDespesa(it);
    if (!v) continue;
    let chave, rot, cor = '#94A3B8', icone = 'ellipsis', catId = null;
    if (it.natureza === 'fatura') {
      chave = '__fatura'; rot = 'Pagamento de faturas de cartão'; cor = '#475569'; icone = 'credit-card';
    } else if (por === 'favorecido') {
      rot = (it.l.favorecido || '').trim() || '(sem estabelecimento)'; chave = normalizar(rot);
      const c = D.mapa.categorias[it.l.categoria_id]; if (c) { cor = c.cor; icone = c.icone; }
    } else {
      const id = por === 'subcategoria' ? (it.l.subcategoria_id || it.l.categoria_id) : it.l.categoria_id;
      const c = D.mapa.categorias[id];
      chave = id || '__sem'; catId = id;
      rot = c ? (por === 'subcategoria' && c.parent_id ? `${D.mapa.categorias[c.parent_id]?.nome ?? ''} › ${c.nome}` : c.nome) : 'Sem categoria';
      if (c) { cor = c.cor; icone = c.icone; }
    }
    const e = g.get(chave) || { chave, rotulo: rot, cor, icone, categoria_id: catId, valor: 0, qtd: 0, itens: [] };
    e.valor += v; if (it.natureza !== 'reembolso') e.qtd += 1; e.itens.push(it);
    g.set(chave, e); total += v;
  }
  const arr = [...g.values()].filter((e) => e.valor !== 0);
  for (const e of arr) e.pct = total > 0 ? (e.valor / total) * 100 : 0;
  return { grupos: arr, total };
}
export const rankingValor = (grupos) => [...grupos].sort((a, b) => b.valor - a.valor || b.qtd - a.qtd);
export const rankingFrequencia = (grupos) => [...grupos].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);

/** Série temporal de despesas (e opcionalmente por categoria) com granularidade dia/semana/mês. */
export function serieTemporal(itens, ini, fim, gran, valorFn = valorDespesa) {
  const chaves = [];
  const rot = [];
  if (gran === 'mes') {
    for (let ym = ini.slice(0, 7); ym <= fim.slice(0, 7); ym = addMesYM(ym, 1)) chaves.push(ym);
  } else if (gran === 'semana') {
    // semanas começando na segunda-feira
    let d = ini; const dow = new Date(d + 'T12:00:00Z').getUTCDay(); d = addDias(d, -((dow + 6) % 7));
    for (; d <= fim; d = addDias(d, 7)) chaves.push(d);
  } else {
    for (let d = ini; d <= fim; d = addDias(d, 1)) chaves.push(d);
  }
  const idx = new Map(chaves.map((k, i) => [k, i]));
  const vals = new Array(chaves.length).fill(0);
  for (const it of itens) {
    let k;
    if (gran === 'mes') k = it.data.slice(0, 7);
    else if (gran === 'semana') { const dow = new Date(it.data + 'T12:00:00Z').getUTCDay(); k = addDias(it.data, -((dow + 6) % 7)); }
    else k = it.data;
    const i = idx.get(k);
    if (i !== undefined) vals[i] += valorFn(it);
  }
  return { chaves, vals };
}

// ------------------------------------------------------------------ compromissos e projeção
export const dataPrevista = (l) => l.vencimento || l.data_ocorrencia;

/** Lançamentos previstos (a pagar/receber) em conta, até `ate`. */
export function previstos(D, { ini = '0000-01-01', fim = '9999-12-31', tipo } = {}) {
  return vivos(D).filter((l) => l.status === 'previsto' && !l.cartao_id && (!tipo || l.tipo === tipo)
    && (l.tipo === 'despesa' || l.tipo === 'receita' || l.tipo === 'pagamento_fatura' || l.tipo === 'transferencia')
    && dataPrevista(l) >= ini && dataPrevista(l) <= fim);
}

/** Faturas com valor em aberto (inclui compras previstas no cartão) com vencimento até `ate`. */
export function faturasEmAberto(D, hoje, ate = '9999-12-31', desde = '0000-01-01') {
  const out = [];
  for (const c of D.cartoes) {
    for (const r of faturasDoCartao(D, c, hoje)) {
      const devido = r.aberto + r.previstas;
      if (devido > 0 && r.vencimento <= ate && r.vencimento >= desde) out.push({ ...r, devido });
    }
  }
  return out.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Saldo projetado ao fim do mês `ym`: saldo realizado hoje + previstos até o fim do mês − faturas a vencer até lá. */
export function projecaoFimMes(D, ym, hoje) {
  const fim = ultimoDia(ym);
  if (fim < hoje) return { valor: saldoConsolidado(D, fim), realizado: true };
  let v = saldoConsolidado(D, hoje);
  for (const l of previstos(D, { fim })) {
    if (l.tipo === 'receita') v += l.valor_centavos;
    else if (l.tipo === 'despesa') v -= l.valor_centavos;
    // pagamento de fatura previsto: já considerado pela fatura em aberto; transferência: neutra no consolidado
  }
  for (const f of faturasEmAberto(D, hoje, fim)) v -= f.devido;
  return { valor: v, realizado: false };
}

/** Série de saldo: realizado até o mês atual, projetado depois. */
export function serieSaldo(D, ymIni, ymFim, hoje) {
  const out = [];
  for (let ym = ymIni; ym <= ymFim; ym = addMesYM(ym, 1)) {
    const fim = ultimoDia(ym);
    if (fim < hoje) out.push({ ym, realizado: saldoConsolidado(D, fim), projetado: null });
    else if (ym === hoje.slice(0, 7)) out.push({ ym, realizado: saldoConsolidado(D, hoje), projetado: projecaoFimMes(D, ym, hoje).valor });
    else out.push({ ym, realizado: null, projetado: projecaoFimMes(D, ym, hoje).valor });
  }
  return out;
}

// ------------------------------------------------------------------ recorrências
export function dataOcorrencia(rec, seq) {
  const dia = Number(rec.inicio.slice(8, 10));
  switch (rec.frequencia) {
    case 'semanal': return addDias(rec.inicio, 7 * (seq - 1));
    case 'quinzenal': return addDias(rec.inicio, 14 * (seq - 1));
    case 'anual': return addMeses(rec.inicio, 12 * (seq - 1), dia);
    default: return addMeses(rec.inicio, seq - 1, dia);
  }
}
export function ocorrencias(rec, ate) {
  const out = [];
  for (let seq = 1; seq < 2000; seq++) {
    const d = dataOcorrencia(rec, seq);
    if (d > ate || (rec.fim && d > rec.fim)) break;
    out.push({ seq, data: d });
  }
  return out;
}
export function lancamentoDaRecorrencia(rec, seq, data, D) {
  const cartao = rec.cartao_id ? D.mapa.cartoes[rec.cartao_id] : null;
  return {
    tipo: rec.tipo, descricao: rec.descricao, valor_centavos: rec.valor_centavos,
    categoria_id: rec.categoria_id, subcategoria_id: rec.subcategoria_id,
    data_ocorrencia: data, competencia: primeiroDia(ymDe(data)), vencimento: data, data_efetiva: null,
    conta_id: rec.conta_id || null, cartao_id: rec.cartao_id || null,
    fatura: cartao ? faturaDaCompra(cartao, data) : null,
    forma_pagamento: rec.forma_pagamento || (cartao ? 'credito' : null),
    status: 'previsto', pagador_id: rec.pagador_id, beneficiario_id: rec.beneficiario_id,
    favorecido: rec.favorecido, projeto_id: rec.projeto_id, observacoes: rec.observacoes,
    etiquetas: rec.etiquetas || [], recorrencia_id: rec.id, recorrencia_seq: seq,
  };
}
/** Ocorrências que ainda não existem como lançamento (inclusive as que foram para a lixeira não são recriadas). */
export function recorrenciasPendentes(D, ate) {
  const existentes = new Set(D.lancamentos.filter((l) => l.recorrencia_id).map((l) => l.recorrencia_id + '#' + l.recorrencia_seq));
  const out = [];
  for (const r of D.recorrencias) {
    if (!r.ativa) continue;
    for (const o of ocorrencias(r, ate)) {
      if (!existentes.has(r.id + '#' + o.seq)) out.push(lancamentoDaRecorrencia(r, o.seq, o.data, D));
    }
  }
  return out;
}

// ------------------------------------------------------------------ orçamento
export function orcamentoDoMes(D, ym, categoriaId = null) {
  const mes = primeiroDia(ym);
  const doCat = D.orcamentos.filter((o) => (o.categoria_id || null) === categoriaId);
  const especifico = doCat.find((o) => o.mes === mes);
  if (especifico) return { valor: especifico.valor_centavos, registro: especifico, especifico: true };
  const padrao = doCat.find((o) => !o.mes);
  return padrao ? { valor: padrao.valor_centavos, registro: padrao, especifico: false } : null;
}
export function nivelAlerta(pctUsado, cfg) {
  if (pctUsado == null) return 'ok';
  if (pctUsado >= (cfg?.alerta_limite_pct ?? 100)) return 'estourado';
  if (pctUsado >= (cfg?.alerta_atencao_pct ?? 80)) return 'atencao';
  return 'ok';
}
/** Orçamento x realizado (base consumo) do mês. */
export function statusOrcamento(D, ym) {
  const itens = itensBase(D, 'consumo', primeiroDia(ym), ultimoDia(ym));
  const { grupos, total } = agrupar(D, itens, 'categoria');
  const porCat = Object.fromEntries(grupos.map((g) => [g.chave, g.valor]));
  const geral = orcamentoDoMes(D, ym, null);
  const cats = D.categorias.filter((c) => c.tipo === 'despesa' && !c.parent_id);
  const linhas = [];
  for (const c of cats) {
    const o = orcamentoDoMes(D, ym, c.id);
    const gasto = porCat[c.id] || 0;
    if (!o && !gasto) continue;
    const p = o && o.valor > 0 ? (gasto / o.valor) * 100 : null;
    linhas.push({ categoria: c, orcado: o?.valor ?? null, registro: o?.registro, gasto, pct: p, nivel: nivelAlerta(p, D.config) });
  }
  linhas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.gasto - a.gasto);
  const pctGeral = geral && geral.valor > 0 ? (total / geral.valor) * 100 : null;
  const somaCats = linhas.reduce((s, l) => s + (l.orcado || 0), 0);
  return { geral: geral?.valor ?? null, registroGeral: geral?.registro, gasto: total, pct: pctGeral, nivel: nivelAlerta(pctGeral, D.config), linhas, somaCats };
}

// ------------------------------------------------------------------ metas e projetos
export function somaAportes(D, campo, id) {
  let s = 0;
  for (const a of D.aportes) if (a[campo] === id) s += a.tipo === 'resgate' ? -a.valor_centavos : a.valor_centavos;
  return s;
}
function mesesAte(dataAlvo, hoje) {
  if (!dataAlvo) return null;
  return Math.max(1, difMeses(hoje.slice(0, 7), dataAlvo.slice(0, 7)) + (dataAlvo.slice(8, 10) >= hoje.slice(8, 10) ? 1 : 0));
}
export function resumoMeta(D, m, hoje) {
  const acumulado = somaAportes(D, 'meta_id', m.id);
  const falta = Math.max(0, m.valor_alvo_centavos - acumulado);
  const meses = mesesAte(m.data_alvo, hoje);
  const atrasada = m.data_alvo && m.data_alvo < hoje && falta > 0;
  return { acumulado, falta, pct: m.valor_alvo_centavos ? Math.min(100, (acumulado / m.valor_alvo_centavos) * 100) : 0,
    porMes: meses && !atrasada ? Math.ceil(falta / meses) : null, meses, atrasada };
}
/** Projeto: reservado (aportes − resgates) e gasto (despesas efetivadas vinculadas, líquidas de reembolsos) são SEPARADOS.
 *  "Coberto" = maior entre reservado e gasto (o gasto normalmente sai da reserva — não somamos os dois para não duplicar). */
export function resumoProjeto(D, p, hoje) {
  const reservado = somaAportes(D, 'projeto_id', p.id);
  let gasto = 0, previsto = 0, receitas = 0;
  const vinculados = [];
  for (const l of vivos(D)) {
    if (l.projeto_id !== p.id || l.status === 'cancelado') continue;
    vinculados.push(l);
    if (l.tipo === 'despesa') { if (l.status === 'efetivado') gasto += l.valor_centavos; else previsto += l.valor_centavos; }
    else if (l.tipo === 'reembolso' && l.status === 'efetivado') gasto -= l.valor_centavos;
    else if (l.tipo === 'receita' && l.status === 'efetivado') receitas += l.valor_centavos;
  }
  const estimado = p.valor_estimado_centavos;
  const coberto = Math.max(reservado, gasto);
  const falta = Math.max(0, estimado - coberto);
  const meses = p.status === 'concluido' ? null : mesesAte(p.data_alvo, hoje);
  const tarefas = D.tarefas.filter((t) => t.projeto_id === p.id);
  const feitas = tarefas.filter((t) => t.concluida).length;
  return {
    estimado, reservado, gasto, previsto, receitas, coberto, falta, saldoReserva: reservado - gasto,
    pctFinanceiro: estimado > 0 ? Math.min(100, (coberto / estimado) * 100) : null,
    pctGasto: estimado > 0 ? Math.min(100, (gasto / estimado) * 100) : null,
    porMes: meses && falta > 0 && !(p.data_alvo < hoje) ? Math.ceil(falta / meses) : null, meses,
    tarefas: tarefas.length, feitas, pctTarefas: tarefas.length ? (feitas / tarefas.length) * 100 : null, vinculados,
  };
}

// ------------------------------------------------------------------ utilidades
export function indexar(D) {
  const m = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  D.mapa = {
    categorias: m(D.categorias), contas: m(D.contas), cartoes: m(D.cartoes), pessoas: m(D.pessoas),
    projetos: m(D.projetos), perfis: m(D.perfis), lancamentos: m(D.lancamentos), metas: m(D.metas), recorrencias: m(D.recorrencias),
  };
  return D;
}
export const tomSaldo = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
