import { useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Base, SeletorMes, Vazio, Sel, Campo, Grafico, opcoesContas, opcoesPessoas } from './comp.js';
import { useStore, toast } from '../data/store.js';
import * as C from '../lib/calc.js';
import { brl, pct, primeiroDia, ultimoDia, addMesYM, mesCurto, nomeMesCap, hoje, dataBR, dataHoraBR, variacao } from '../lib/fmt.js';
import { exportarCSV, exportarXLSX } from '../lib/exportar.js';
import { periodoAnterior, Variacao } from './analises.js';
import { NOME_OFICIAL, SUBTITULO } from './login.js';
import { ST_PROJ } from './projetos.js';

export function Relatorios() {
  const { D, mes, perfil } = useStore();
  const [tipo, setTipo] = useState('mensal');
  const [f, setF] = useState({});
  const set = (p) => setF((x) => { const n = { ...x, ...p }; for (const k in n) if (!n[k]) delete n[k]; return n; });
  const H = hoje();
  const ano = mes.slice(0, 4);
  const P = tipo === 'mensal' ? { ini: primeiroDia(mes), fim: ultimoDia(mes), rot: nomeMesCap(mes) } : { ini: ano + '-01-01', fim: ano + '-12-31', rot: 'Ano de ' + ano };
  const PA = periodoAnterior(P);

  const R = useMemo(() => {
    const cons = C.itensBase(D, 'consumo', P.ini, P.fim, f);
    const caixa = C.itensBase(D, 'caixa', P.ini, P.fim, f);
    const consA = C.itensBase(D, 'consumo', PA.ini, PA.fim, f);
    const tCons = C.totais(cons), tCaixa = C.totais(caixa);
    const g = C.agrupar(D, cons, 'categoria'); const gA = C.agrupar(D, consA, 'categoria');
    const ant = Object.fromEntries(gA.grupos.map((x) => [x.chave, x.valor]));
    const crescimento = g.grupos.map((x) => ({ ...x, anterior: ant[x.chave] || 0, var: variacao(x.valor, ant[x.chave] || 0), dif: x.valor - (ant[x.chave] || 0) }))
      .sort((a, b) => b.dif - a.dif).filter((x) => x.dif > 0).slice(0, 8);
    const pendentes = C.previstos(D, { fim: P.fim }).filter((l) => (l.tipo === 'despesa' || l.tipo === 'receita') && C.passaFiltro(l, f, D) && (C.dataPrevista(l) >= P.ini || C.dataPrevista(l) < H))
      .sort((a, b) => C.dataPrevista(a).localeCompare(C.dataPrevista(b)));
    const faturas = C.faturasEmAberto(D, H, P.fim).filter((x) => !f.cartao_id || x.cartao.id === f.cartao_id);
    const parcelasFuturas = C.vivos(D).filter((l) => l.parcelas_total > 1 && l.status !== 'cancelado' && C.passaFiltro(l, f, D) && (l.cartao_id ? l.fatura > primeiroDia(H.slice(0, 7)) : l.status === 'previsto'))
      .sort((a, b) => (a.fatura || a.vencimento).localeCompare(b.fatura || b.vencimento));
    const meses = []; for (let ym = P.ini.slice(0, 7); ym <= P.fim.slice(0, 7); ym = addMesYM(ym, 1)) meses.push(ym);
    const porMes = meses.map((ym) => ({ ym, cons: C.totais(cons.filter((i) => i.data.slice(0, 7) === ym)), caixa: C.totais(caixa.filter((i) => i.data.slice(0, 7) === ym)) }));
    const orc = meses.map((ym) => C.statusOrcamento(D, ym));
    const orcCats = {};
    for (const o of orc) for (const l of o.linhas) { const e = orcCats[l.categoria.id] ||= { categoria: l.categoria, orcado: 0, gasto: 0, temOrc: false }; e.gasto += l.gasto; if (l.orcado != null) { e.orcado += l.orcado; e.temOrc = true; } }
    const orcGeral = orc.reduce((s, o) => s + (o.geral || 0), 0);
    const projetos = D.projetos.map((p) => ({ p, r: C.resumoProjeto(D, p, H) }));
    const lancs = C.vivos(D).filter((l) => C.passaFiltro(l, f, D) && ((l.status === 'previsto' ? C.dataPrevista(l) : C.dataConsumo(l)) >= P.ini) && ((l.status === 'previsto' ? C.dataPrevista(l) : C.dataConsumo(l)) <= P.fim))
      .sort((a, b) => a.data_ocorrencia.localeCompare(b.data_ocorrencia));
    return { cons, tCons, tCaixa, g, crescimento, pendentes, faturas, parcelasFuturas, porMes, orcCats: Object.values(orcCats).filter((x) => x.temOrc), orcGeral, projetos, lancs };
  }, [D, P.ini, P.fim, JSON.stringify(f)]);

  const rank = C.rankingValor(R.g.grupos); const freq = C.rankingFrequencia(R.g.grupos);
  const nm = `relatorio-${tipo === 'mensal' ? mes : ano}`;
  function excel() {
    const ok = exportarXLSX(D, R.lancs, nm + '.xlsx', [
      { nome: 'Resumo', linhas: [{ Indicador: 'Receitas (caixa)', Valor: R.tCaixa.receitas / 100 }, { Indicador: 'Despesas pagas (caixa)', Valor: R.tCaixa.despesas / 100 }, { Indicador: 'Resultado (caixa)', Valor: R.tCaixa.resultado / 100 },
        { Indicador: 'Receitas (competência)', Valor: R.tCons.receitas / 100 }, { Indicador: 'Consumo (competência)', Valor: R.tCons.despesas / 100 }, { Indicador: 'Resultado (competência)', Valor: R.tCons.resultado / 100 }] },
      { nome: 'Por categoria (competência)', linhas: rank.map((g, i) => ({ Posição: i + 1, Categoria: g.rotulo, Valor: g.valor / 100, Ocorrências: g.qtd, 'Participação %': +g.pct.toFixed(2) })) },
      { nome: 'Mês a mês', linhas: R.porMes.map((m) => ({ Mês: mesCurto(m.ym), 'Receitas caixa': m.caixa.receitas / 100, 'Despesas caixa': m.caixa.despesas / 100, 'Resultado caixa': m.caixa.resultado / 100, 'Consumo competência': m.cons.despesas / 100 })) },
      { nome: 'Projetos', linhas: R.projetos.map(({ p, r }) => ({ Projeto: p.nome, Situação: ST_PROJ[p.status][1], Estimado: r.estimado / 100, Reservado: r.reservado / 100, Gasto: r.gasto / 100, Falta: r.falta / 100, 'Tarefas concluídas': `${r.feitas}/${r.tarefas}` })) },
    ]);
    if (!ok) toast('Não há lançamentos no período para exportar.', 'erro');
  }

  return html`
  <div class="topo nao-imprimir"><div><h2>Relatórios</h2><div class="sub">Mensal ou anual, com exportação</div></div><span class="esp"></span>
    <div class="btn-grupo"><button class=${tipo === 'mensal' ? 'on' : ''} onClick=${() => setTipo('mensal')}>Mensal</button><button class=${tipo === 'anual' ? 'on' : ''} onClick=${() => setTipo('anual')}>Anual</button></div>
    <${SeletorMes} compacto /></div>
  <div class="card nao-imprimir" style="margin-bottom:16px"><div class="filtros">
    <${Campo} rot="Conta"><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Todas" opcoes=${opcoesContas(D, { incluirArquivadas: true })} /></${Campo}>
    <${Campo} rot="Cartão"><${Sel} valor=${f.cartao_id} onChange=${(v) => set({ cartao_id: v })} vazio="Todos" opcoes=${D.cartoes.map((c) => ({ v: c.id, r: c.nome }))} /></${Campo}>
    <${Campo} rot="Beneficiário"><${Sel} valor=${f.beneficiario_id} onChange=${(v) => set({ beneficiario_id: v })} vazio="Todos" opcoes=${opcoesPessoas(D)} /></${Campo}>
    <${Campo} rot="Quem pagou"><${Sel} valor=${f.pagador_id} onChange=${(v) => set({ pagador_id: v })} vazio="Todos" opcoes=${opcoesPessoas(D)} /></${Campo}>
    <${Campo} rot="Projeto"><${Sel} valor=${f.projeto_id} onChange=${(v) => set({ projeto_id: v })} vazio="Todos" opcoes=${D.projetos.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
    <span style="flex:1"></span>
    <button class="btn" onClick=${() => window.print()}><${Icone} n="printer" /> Exportar PDF</button>
    <button class="btn sec" onClick=${excel}><${Icone} n="file-spreadsheet" /> Excel</button>
    <button class="btn sec" onClick=${() => exportarCSV(D, R.lancs, nm + '.csv') || toast('Nada para exportar.', 'erro')}><${Icone} n="download" /> CSV</button>
  </div><small style="color:var(--txt3)">“Exportar PDF” abre a impressão do navegador: escolha <b>Salvar como PDF</b>. Os filtros acima valem para o relatório e as exportações.</small></div>

  <div class="so-impressao" style="margin-bottom:12px"><h1 style="margin:0;font-size:20px">${NOME_OFICIAL}</h1><div style="color:#555">${SUBTITULO}</div>
    <div style="margin-top:6px"><b>Relatório ${tipo} — ${P.rot}</b> · gerado por ${perfil?.nome} em ${dataHoraBR(new Date().toISOString())}${Object.keys(f).length ? ' · com filtros' : ''}</div></div>
  <h2 class="nao-imprimir" style="margin:0 0 12px">Relatório ${tipo} — ${P.rot}</h2>

  <div class="grade g-2" style="margin-bottom:16px">
    <div class="card"><h3>Fluxo de caixa <span class="acao"><${Base} base="caixa" /></span></h3>
      <table class="tab"><tbody><tr><td>Receitas recebidas</td><td class="r num">${brl(R.tCaixa.receitas)}</td></tr><tr><td>Despesas pagas (inclui faturas)</td><td class="r num">${brl(R.tCaixa.despesas)}</td></tr></tbody>
        <tfoot><tr><td>Resultado</td><td class="r"><${Tom} v=${R.tCaixa.resultado} /></td></tr></tfoot></table></div>
    <div class="card"><h3>Consumo por competência <span class="acao"><${Base} base="consumo" /></span></h3>
      <table class="tab"><tbody><tr><td>Receitas da competência</td><td class="r num">${brl(R.tCons.receitas)}</td></tr><tr><td>Consumo (inclui compras no cartão)</td><td class="r num">${brl(R.tCons.despesas)}</td></tr></tbody>
        <tfoot><tr><td>Resultado</td><td class="r"><${Tom} v=${R.tCons.resultado} /></td></tr></tfoot></table></div>
  </div>

  ${tipo === 'anual' && html`<div class="card" style="margin-bottom:16px"><h3>Mês a mês</h3><div class="tabela-wrap"><table class="tab"><thead><tr><th>Mês</th><th class="r">Receitas (caixa)</th><th class="r">Despesas (caixa)</th><th class="r">Resultado (caixa)</th><th class="r">Consumo (competência)</th></tr></thead>
    <tbody>${R.porMes.map((m) => html`<tr><td>${nomeMesCap(m.ym)}</td><td class="r num">${brl(m.caixa.receitas)}</td><td class="r num">${brl(m.caixa.despesas)}</td><td class="r"><${Tom} v=${m.caixa.resultado} /></td><td class="r num">${brl(m.cons.despesas)}</td></tr>`)}</tbody>
    <tfoot><tr><td>Total</td><td class="r num">${brl(R.tCaixa.receitas)}</td><td class="r num">${brl(R.tCaixa.despesas)}</td><td class="r"><${Tom} v=${R.tCaixa.resultado} /></td><td class="r num">${brl(R.tCons.despesas)}</td></tr></tfoot></table></div></div>`}

  <div class="card" style="margin-bottom:16px"><h3>Distribuição e ranking por categoria <span class="acao"><${Base} base="consumo" /></span></h3>
    ${rank.length ? html`<div class="grade g-cc" style="align-items:center">
      <${Grafico} chave=${'rel' + P.ini + R.g.total + JSON.stringify(f)} altura=${230} rotulo="Distribuição por categoria" cfg=${{ type: 'doughnut', data: { labels: rank.map((g) => g.rotulo), datasets: [{ data: rank.map((g) => g.valor / 100), backgroundColor: rank.map((g) => g.cor), borderColor: '#fff', borderWidth: 2 }] }, options: { cutout: '58%', animation: false, plugins: { legend: { display: false } } } }} />
      <div class="tabela-wrap"><table class="tab"><thead><tr><th>#</th><th>Categoria</th><th class="r">Valor</th><th class="r">Part.</th><th class="r">Vezes</th><th class="r">Pos. frequência</th></tr></thead><tbody>
        ${rank.map((g, i) => html`<tr><td>${i + 1}º</td><td><span style="display:flex;gap:8px;align-items:center"><${CatIcone} p cor=${g.cor} icone=${g.icone} />${g.rotulo}</span></td><td class="r num">${brl(g.valor)}</td><td class="r num">${pct(g.pct)}</td><td class="r num">${g.qtd}</td><td class="r">${freq.indexOf(g) + 1}º</td></tr>`)}
      </tbody><tfoot><tr><td></td><td>Total</td><td class="r num">${brl(R.g.total)}</td><td class="r">100%</td><td class="r num">${rank.reduce((s, g) => s + g.qtd, 0)}</td><td></td></tr></tfoot></table></div></div>`
    : html`<${Vazio} icone="chart-pie" titulo="Sem consumo no período" />`}
  </div>

  <div class="grade g-2" style="margin-bottom:16px">
    <div class="card"><h3>Categorias com maior crescimento <span class="acao"><${Base} base="consumo" /></span></h3><div class="card-sub">Comparado a ${dataBR(PA.ini)}–${dataBR(PA.fim)}</div>
      ${R.crescimento.length ? html`<table class="tab"><thead><tr><th>Categoria</th><th class="r">Antes</th><th class="r">Agora</th><th class="r">Variação</th></tr></thead><tbody>
        ${R.crescimento.map((g) => html`<tr><td>${g.rotulo}</td><td class="r num">${brl(g.anterior)}</td><td class="r num">${brl(g.valor)}</td><td class="r">${g.var == null ? html`<span class="pilula atn">novo</span>` : html`<${Variacao} v=${g.var} inverso />`}</td></tr>`)}</tbody></table>`
        : html`<${Vazio} icone="trending-up" titulo="Nenhuma categoria cresceu" />`}</div>
    <div class="card"><h3>Orçamento × realizado <span class="acao"><${Base} base="consumo" /></span></h3>
      ${R.orcCats.length || R.orcGeral ? html`<table class="tab"><thead><tr><th>Categoria</th><th class="r">Planejado</th><th class="r">Realizado</th><th class="r">Uso</th></tr></thead><tbody>
        ${R.orcGeral > 0 && html`<tr><td><b>Geral da família</b></td><td class="r num">${brl(R.orcGeral)}</td><td class="r num">${brl(R.tCons.despesas)}</td><td class="r">${pct(R.tCons.despesas / R.orcGeral * 100)}</td></tr>`}
        ${R.orcCats.map((o) => html`<tr><td>${o.categoria.nome}</td><td class="r num">${brl(o.orcado)}</td><td class="r num">${brl(o.gasto)}</td><td class="r"><span class=${'pilula ' + (o.gasto > o.orcado ? 'neg' : o.gasto >= o.orcado * 0.8 ? 'atn' : 'pos')}>${o.orcado ? pct(o.gasto / o.orcado * 100) : '—'}</span></td></tr>`)}</tbody></table>`
        : html`<${Vazio} icone="target" titulo="Sem orçamento definido" />`}</div>
  </div>

  <div class="grade g-2" style="margin-bottom:16px">
    <div class="card"><h3>Contas pendentes</h3><div class="card-sub">Previstas no período e atrasadas · faturas em aberto</div>
      ${R.pendentes.length || R.faturas.length ? html`<table class="tab"><thead><tr><th>Vencimento</th><th>Descrição</th><th class="r">Valor</th></tr></thead><tbody>
        ${R.pendentes.map((l) => html`<tr><td>${dataBR(C.dataPrevista(l))}${C.dataPrevista(l) < H ? html` <span class="pilula neg">⚠ vencida</span>` : ''}</td><td>${l.tipo === 'receita' ? '▲ ' : '▼ '}${l.descricao}</td><td class="r num">${brl(l.valor_centavos)}</td></tr>`)}
        ${R.faturas.map((x) => html`<tr><td>${dataBR(x.vencimento)}${x.vencimento < H ? html` <span class="pilula neg">⚠ vencida</span>` : ''}</td><td>▼ Fatura ${x.cartao.nome}</td><td class="r num">${brl(x.devido)}</td></tr>`)}</tbody></table>`
        : html`<${Vazio} icone="circle-check" titulo="Nada pendente" />`}</div>
    <div class="card"><h3>Parcelas futuras</h3>
      ${R.parcelasFuturas.length ? html`<table class="tab"><thead><tr><th>Fatura/venc.</th><th>Compra</th><th class="r">Parcela</th><th class="r">Valor</th></tr></thead><tbody>
        ${R.parcelasFuturas.slice(0, 40).map((l) => html`<tr><td>${l.fatura ? mesCurto(l.fatura.slice(0, 7)) : dataBR(l.vencimento)}</td><td>${l.descricao}</td><td class="r">${l.parcela_num}/${l.parcelas_total}</td><td class="r num">${brl(l.valor_centavos)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="3">Total comprometido</td><td class="r num">${brl(R.parcelasFuturas.reduce((s, l) => s + l.valor_centavos, 0))}</td></tr></tfoot></table>`
        : html`<${Vazio} icone="layers" titulo="Nenhuma parcela futura" />`}</div>
  </div>

  <div class="card"><h3>Resumo dos projetos</h3>
    ${R.projetos.length ? html`<div class="tabela-wrap"><table class="tab"><thead><tr><th>Projeto</th><th>Situação</th><th class="r">Estimado</th><th class="r">Reservado</th><th class="r">Gasto</th><th class="r">Falta</th><th class="r">Tarefas</th></tr></thead><tbody>
      ${R.projetos.map(({ p, r }) => html`<tr><td>${p.nome}</td><td>${ST_PROJ[p.status][1]}</td><td class="r num">${brl(r.estimado)}</td><td class="r num">${brl(r.reservado)}</td><td class="r num">${brl(r.gasto)}</td><td class="r num">${brl(r.falta)}</td><td class="r">${r.tarefas ? `${r.feitas}/${r.tarefas}` : '—'}</td></tr>`)}</tbody></table></div>
      <small style="color:var(--txt3)">Reservado não é despesa; gasto já está incluído nos totais acima (sem duplicidade).</small>`
      : html`<${Vazio} icone="folder-kanban" titulo="Nenhum projeto" />`}</div>`;
}
