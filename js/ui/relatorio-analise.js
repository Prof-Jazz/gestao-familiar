// Relatório completo da análise (versão para impressão / "Salvar como PDF").
// Usa só tabelas e barras em CSS (gráficos de canvas não imprimem bem quando ocultos na tela).
import { html } from './comp.js';
import * as C from '../lib/calc.js';
import { saudeFinanceira, mesesDoPeriodo } from '../lib/saude.js';
import { brl, pct, primeiroDia, ultimoDia, nomeMesCap, mesCurto, dataBR, dataHoraBR, addMesYM, variacao } from '../lib/fmt.js';
import { NOME_OFICIAL, SUBTITULO } from './login.js';

const COR_N = { otimo: '#12855A', bom: '#2F7D32', atencao: '#B7791F', critico: '#C53030', neutro: '#6B7280' };
const var$ = (a, b) => { const v = variacao(a, b); return v == null ? '—' : `${v > 0 ? '▲' : v < 0 ? '▼' : '●'} ${pct(Math.abs(v))}`; };

export function RelatorioAnalise({ D, P, f, mes, hoje, perfil, filtrosTxt }) {
  const S = saudeFinanceira(D, P.ini, P.fim, hoje, f);
  const meses = mesesDoPeriodo(P.ini, P.fim);
  const porMes = meses.map((ym) => ({ ym, ...C.totais(S.itens.filter((it) => it.data.slice(0, 7) === ym)) }));
  const maxMes = Math.max(1, ...porMes.map((m) => Math.max(m.receitas, m.despesas)));
  const tres = [-2, -1, 0].map((k) => { const ym = addMesYM(mes, k); return { ym, ...C.totais(C.itensBase(D, 'consumo', primeiroDia(ym), ultimoDia(ym), f, { soPagas: true })) }; });
  const gCat = C.rankingValor(C.agrupar(D, S.itens, 'categoria').grupos);
  const gSub = C.rankingValor(C.agrupar(D, S.itens, 'subcategoria').grupos).slice(0, 12);
  const gLug = C.rankingValor(C.agrupar(D, S.itens, 'favorecido').grupos).slice(0, 10);
  const rIts = S.itens.filter((it) => C.valorReceita(it) > 0);
  const rCat = C.rankingValor(C.agrupar(D, rIts, 'categoria', C.valorReceita).grupos);
  const rOri = C.rankingValor(C.agrupar(D, rIts, 'favorecido', C.valorReceita).grupos).slice(0, 10);
  const maiores = S.itens.filter((it) => C.valorDespesa(it) > 0).sort((a, b) => b.valor - a.valor).slice(0, 10);
  const T = S.tot;

  const Barra = ({ v, max, cor }) => html`<span class="rp-barra"><i style=${`width:${Math.max(1, (v / (max || 1)) * 100)}%;background:${cor}`}></i></span>`;
  const TabRank = ({ grupos, total, cor, col = 'Categoria' }) => html`<table class="rp-tab"><thead><tr><th>#</th><th>${col}</th><th class="r">Valor</th><th class="r">%</th><th class="r">Vezes</th><th></th></tr></thead>
    <tbody>${grupos.map((g, i) => html`<tr><td>${i + 1}</td><td>${g.rotulo}</td><td class="r">${brl(g.valor)}</td><td class="r">${pct(total ? (g.valor / total) * 100 : 0)}</td><td class="r">${g.qtd}</td>
      <td style="width:28%"><${Barra} v=${g.valor} max=${grupos[0]?.valor} cor=${g.cor || cor} /></td></tr>`)}</tbody></table>`;

  return html`<div class="so-impressao relatorio-pdf">
    <header class="rp-cab">
      <div><div class="rp-marca">${NOME_OFICIAL}</div><div class="rp-sub">${SUBTITULO}</div></div>
      <div class="rp-meta"><b>Relatório de análise financeira</b><br />${P.rot} (${dataBR(P.ini)} a ${dataBR(P.fim)})<br />Gerado por ${perfil?.nome || '—'} em ${dataHoraBR(new Date().toISOString())}${filtrosTxt ? html`<br />Filtros: ${filtrosTxt}` : ''}</div>
    </header>

    <section class="rp-sec">
      <h2>1. Resumo do período</h2>
      <div class="rp-kpis">
        <div><small>Receitas</small><b style="color:#12855A">${brl(T.receitas)}</b><span>média ${brl(S.recMedia)}/mês</span></div>
        <div><small>Gastos</small><b style="color:#C53030">${brl(T.despesas)}</b><span>média ${brl(S.gastoMedio)}/mês</span></div>
        <div><small>${T.resultado >= 0 ? 'Sobrou' : 'Faltou'}</small><b style=${`color:${T.resultado >= 0 ? '#12855A' : '#C53030'}`}>${brl(Math.abs(T.resultado))}</b><span>${T.receitas ? pct((T.resultado / T.receitas) * 100) + ' das receitas' : ''}</span></div>
        <div><small>Saldo atual nas contas</small><b>${brl(S.saldo)}</b><span>em ${dataBR(hoje)}</span></div>
      </div>
    </section>

    <section class="rp-sec">
      <h2>2. Saúde financeira</h2>
      <div class="rp-nota"><div class="rp-nota-num" style=${`border-color:${S.nota >= 80 ? COR_N.otimo : S.nota >= 60 ? COR_N.bom : S.nota >= 40 ? COR_N.atencao : COR_N.critico}`}>${S.nota ?? '—'}<small>/100</small></div>
        <div><b>${S.notaRot}</b><p>Nota calculada a partir dos cinco indicadores abaixo. É uma referência para acompanhar a evolução mês a mês, não uma avaliação profissional.</p></div></div>
      <table class="rp-tab"><thead><tr><th>Indicador</th><th class="r">Resultado</th><th>Situação</th><th>O que significa</th></tr></thead>
        <tbody>${S.indicadores.map((i) => html`<tr><td><b>${i.titulo}</b></td><td class="r">${i.moeda ? brl(i.valor) : i.valor}</td>
          <td><span class="rp-selo" style=${`background:${COR_N[i.n]}`}>${i.rot}</span></td><td class="rp-exp">${i.explica}</td></tr>`)}</tbody></table>
      <div class="rp-pontos">
        ${S.pontos.fortes.length > 0 && html`<div><h3 style="color:#12855A">Pontos fortes</h3><ul>${S.pontos.fortes.map((t) => html`<li>${t}</li>`)}</ul></div>`}
        ${S.pontos.atencao.length > 0 && html`<div><h3 style="color:#B7791F">Pontos de atenção</h3><ul>${S.pontos.atencao.map((t) => html`<li>${t}</li>`)}</ul></div>`}
        ${S.pontos.sugestoes.length > 0 && html`<div><h3 style="color:#4338CA">Sugestões</h3><ul>${S.pontos.sugestoes.map((t) => html`<li>${t}</li>`)}</ul></div>`}
      </div>
    </section>

    <section class="rp-sec">
      <h2>3. Comparação com os 2 meses anteriores</h2>
      <table class="rp-tab"><thead><tr><th></th>${tres.map((t) => html`<th class="r">${nomeMesCap(t.ym)}</th>`)}</tr></thead>
        <tbody>${[['Receitas', 'receitas'], ['Gastos', 'despesas'], ['Sobrou', 'resultado']].map(([r, k]) => html`<tr><td><b>${r}</b></td>${tres.map((t, i) => html`<td class="r">${brl(t[k])}${i > 0 ? html`<br /><small>${var$(t[k], tres[i - 1][k])}</small>` : ''}</td>`)}</tr>`)}</tbody></table>
    </section>

    ${meses.length > 1 && html`<section class="rp-sec">
      <h2>4. Mês a mês</h2>
      <table class="rp-tab"><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Gastos</th><th class="r">Sobrou</th><th style="width:34%">Receitas (verde) × gastos (vermelho)</th></tr></thead>
        <tbody>${porMes.map((m) => html`<tr><td>${mesCurto(m.ym)}</td><td class="r">${brl(m.receitas)}</td><td class="r">${brl(m.despesas)}</td><td class="r" style=${m.resultado < 0 ? 'color:#C53030' : ''}>${brl(m.resultado)}</td>
          <td><${Barra} v=${m.receitas} max=${maxMes} cor="#16A34A" /><${Barra} v=${m.despesas} max=${maxMes} cor="#E11D48" /></td></tr>`)}</tbody>
        <tfoot><tr><td>Total</td><td class="r">${brl(T.receitas)}</td><td class="r">${brl(T.despesas)}</td><td class="r">${brl(T.resultado)}</td><td></td></tr></tfoot></table>
    </section>`}

    <section class="rp-sec">
      <h2>${meses.length > 1 ? 5 : 4}. Para onde foi o dinheiro</h2>
      <h3>Gastos por categoria</h3>${gCat.length ? html`<${TabRank} grupos=${gCat} total=${T.despesas} cor="#E11D48" />` : html`<p>Sem gastos no período.</p>`}
      ${gSub.length > 0 && html`<h3>Principais subcategorias</h3><${TabRank} grupos=${gSub} total=${T.despesas} cor="#E11D48" col="Subcategoria" />`}
      ${gLug.length > 0 && html`<h3>Onde mais gastou</h3><${TabRank} grupos=${gLug} total=${T.despesas} cor="#E11D48" col="Estabelecimento" />`}
      ${maiores.length > 0 && html`<h3>Maiores gastos do período</h3><table class="rp-tab"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead>
        <tbody>${maiores.map((it) => html`<tr><td>${dataBR(it.data)}</td><td>${it.l.descricao}</td><td>${D.mapa.categorias[it.l.categoria_id]?.nome || '—'}</td><td class="r">${brl(it.valor)}</td></tr>`)}</tbody></table>`}
    </section>

    <section class="rp-sec">
      <h2>${meses.length > 1 ? 6 : 5}. De onde veio o dinheiro</h2>
      ${rCat.length ? html`<h3>Receitas por categoria</h3><${TabRank} grupos=${rCat} total=${T.receitas} cor="#16A34A" />
        <h3>Principais fontes</h3><${TabRank} grupos=${rOri} total=${T.receitas} cor="#16A34A" col="Origem" />` : html`<p>Sem receitas no período.</p>`}
    </section>

    <section class="rp-sec">
      <h2>${meses.length > 1 ? 7 : 6}. Cartões de crédito (situação em ${dataBR(hoje)})</h2>
      ${S.cartoes.length ? html`<table class="rp-tab"><thead><tr><th>Cartão</th><th class="r">Limite</th><th class="r">Comprometido</th><th class="r">Disponível</th><th>Uso</th></tr></thead>
        <tbody>${S.cartoes.map((x) => html`<tr><td>${x.c.nome}</td><td class="r">${brl(x.limite)}</td><td class="r">${brl(x.comprometido)}</td><td class="r" style=${x.disponivel < 0 ? 'color:#C53030' : ''}>${brl(x.disponivel)}</td>
          <td style="width:24%"><${Barra} v=${Math.min(x.comprometido, x.limite)} max=${x.limite} cor=${x.disponivel < 0 ? '#C53030' : '#5B4FE9'} /></td></tr>`)}</tbody></table>
        ${S.faturas.length > 0 && html`<h3>Faturas a pagar</h3><table class="rp-tab"><thead><tr><th>Cartão</th><th>Fatura</th><th>Vencimento</th><th class="r">Valor</th></tr></thead>
          <tbody>${S.faturas.map((x) => html`<tr><td>${x.cartao?.nome || ''}</td><td>${nomeMesCap(x.fatura.slice(0, 7))}</td><td>${dataBR(x.vencimento)}</td><td class="r">${brl(x.devido)}</td></tr>`)}</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="r">${brl(S.dividaCartao)}</td></tr></tfoot></table>`}
        ${S.compras.length > 0 && html`<h3>Parcelamentos em andamento</h3><table class="rp-tab"><thead><tr><th>Descrição</th><th class="r">Parcelas restantes</th><th class="r">Falta pagar</th></tr></thead>
          <tbody>${S.compras.map((x) => html`<tr><td>${x.parcelas[0]?.descricao}</td><td class="r">${x.restantes} de ${x.parcelas.length}</td><td class="r">${brl(x.restante)}</td></tr>`)}</tbody></table>`}`
      : html`<p>Nenhum cartão cadastrado.</p>`}
    </section>

    <footer class="rp-rodape">Só entra o que já foi pago ou recebido. Compras no cartão entram (na data da compra) depois que a fatura delas é paga; o pagamento da fatura não é contado de novo. Transferências entre contas não entram como receita nem como gasto.</footer>
  </div>`;
}
