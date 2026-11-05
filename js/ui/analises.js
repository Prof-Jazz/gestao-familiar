import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, Icone, CatIcone, Tom, Base, Vazio, Sel, Campo, Grafico, Modal, opcoesContas, opcoesPessoas, opcoesCategorias } from './comp.js';
import { useStore, toast } from '../data/store.js';
import { RelatorioAnalise } from './relatorio-analise.js';
import { exportarCSV, exportarXLSX } from '../lib/exportar.js';
import { ItemLanc } from './item.js';
import * as C from '../lib/calc.js';
import { brl, pct, primeiroDia, ultimoDia, addMesYM, mesCurto, dataBR, difDias, addDias, variacao, hoje, nomeMesCap } from '../lib/fmt.js';

const fmtEixo = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const tip = (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${brl(Math.round(c.raw * 100))}`;
const optsEixo = (extra = {}) => ({ interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: tip } } },
  scales: { y: { ticks: { callback: fmtEixo }, grid: { color: '#EEF0F6' } }, x: { grid: { display: false } } }, ...extra });

export function periodoDe(preset, mes, livre) {
  const H = hoje();
  switch (preset) {
    case 'mes': return { ini: primeiroDia(mes), fim: ultimoDia(mes), rot: nomeMesCap(mes) };
    case '3m': return { ini: primeiroDia(addMesYM(mes, -2)), fim: ultimoDia(mes), rot: 'Últimos 3 meses' };
    case '6m': return { ini: primeiroDia(addMesYM(mes, -5)), fim: ultimoDia(mes), rot: 'Últimos 6 meses' };
    case '12m': return { ini: primeiroDia(addMesYM(mes, -11)), fim: ultimoDia(mes), rot: 'Últimos 12 meses' };
    case 'ano': return { ini: mes.slice(0, 4) + '-01-01', fim: mes.slice(0, 4) + '-12-31', rot: 'Ano de ' + mes.slice(0, 4) };
    default: return { ini: livre.ini || H, fim: livre.fim || H, rot: `${dataBR(livre.ini)} a ${dataBR(livre.fim)}` };
  }
}
/** Período imediatamente anterior, com o mesmo tamanho. */
export function periodoAnterior({ ini, fim }) {
  if (ini.slice(8) === '01' && fim === ultimoDia(fim.slice(0, 7))) {
    const n = (+fim.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+fim.slice(5, 7) - +ini.slice(5, 7)) + 1;
    return { ini: primeiroDia(addMesYM(ini.slice(0, 7), -n)), fim: ultimoDia(addMesYM(ini.slice(0, 7), -1)) };
  }
  const n = difDias(ini, fim) + 1;
  return { ini: addDias(ini, -n), fim: addDias(ini, -1) };
}

export function Analises() {
  const { D, mes, perfil } = useStore();
  const [imprimindo, setImprimindo] = useState(false);
  const base = 'consumo'; // gastos no mês em que aconteceram (cartão conta na data da compra)
  const [preset, setPreset] = useState('6m');
  const [livre, setLivre] = useState({ ini: primeiroDia(mes), fim: ultimoDia(mes) });
  const [f, setF] = useState({});
  const [gran, setGran] = useState('mes');
  const [tipoEv, setTipoEv] = useState('gastos');
  const [cats, setCats] = useState([]);
  const [dimRank, setDimRank] = useState('categoria');
  const [fatia, setFatia] = useState(null);
  const [verFiltros, setVerFiltros] = useState(false);
  const set = (p) => setF((x) => { const n = { ...x, ...p }; for (const k in n) if (!n[k]) delete n[k]; return n; });
  const P = periodoDe(preset, mes, livre);
  const mudarPreset = (v) => { setPreset(v); setGran(v === 'mes' || v === 'livre' ? 'dia' : 'mes'); };
  const PA = periodoAnterior(P);
  const H = hoje();

  const r = useMemo(() => {
    const itens = C.itensBase(D, base, P.ini, P.fim, f);
    const itensA = C.itensBase(D, base, PA.ini, PA.fim, f);
    const tot = C.totais(itens), totA = C.totais(itensA);
    const porCat = C.agrupar(D, itens, 'categoria');
    const porCatRec = C.agrupar(D, itens, 'categoria', C.valorReceita);
    const rank = C.agrupar(D, itens, dimRank);
    // evolução
    const serie = C.serieTemporal(itens, P.ini, P.fim, gran);
    const serieRec = C.serieTemporal(itens.filter((it) => C.valorReceita(it) > 0), P.ini, P.fim, gran, C.valorReceita);
    const serieA = null;
    const tres = [-2, -1, 0].map((k) => { const ym = addMesYM(mes, k); return { ym, ...C.totais(C.itensBase(D, base, primeiroDia(ym), ultimoDia(ym), f)) }; });
    const porCatSerie = cats.map((id) => ({ id, s: C.serieTemporal(itens.filter((it) => it.l.categoria_id === id), P.ini, P.fim, gran) }));
    // receitas x despesas por mês (sempre mensal)
    const meses = []; for (let ym = P.ini.slice(0, 7); ym <= P.fim.slice(0, 7); ym = addMesYM(ym, 1)) meses.push(ym);
    const rxd = meses.map((ym) => C.totais(itens.filter((it) => it.data.slice(0, 7) === ym)));
    // orçamento x realizado (consumo, mês selecionado)
    const orc = C.statusOrcamento(D, mes);
    // saldo
    const ymIni = P.ini.slice(0, 7); const ymFim = addMesYM(H.slice(0, 7), 6) > P.fim.slice(0, 7) ? addMesYM(H.slice(0, 7), 6) : P.fim.slice(0, 7);
    const saldo = C.serieSaldo(D, ymIni, ymFim, H);
    return { tres, serieRec, itens, itensA, porCatRec, tot, totA, porCat, rank, serie, serieA, porCatSerie, meses, rxd, orc, saldo };
  }, [D, base, P.ini, P.fim, f, gran, cats.join(), dimRank, mes]);

  const rotSerie = (k) => (gran === 'mes' ? mesCurto(k) : dataBR(k).slice(0, 5));
  const chave = [base, P.ini, P.fim, JSON.stringify(f), gran, cats.join(), mes, D.lancamentos.length, r.tot.despesas, r.tot.receitas].join('|');
  const vDesp = variacao(r.tot.despesas, r.totA.despesas);
  const vRec = variacao(r.tot.receitas, r.totA.receitas);
  const subs = f.categoria_id ? D.categorias.filter((c) => c.parent_id === f.categoria_id).map((c) => ({ v: c.id, r: c.nome })) : [];
  const catsDesp = D.categorias.filter((c) => c.tipo === 'despesa' && !c.parent_id);

  useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener('afterprint', fim, { once: true });
    const t = setTimeout(() => window.print(), 300);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fim); };
  }, [imprimindo]);
  const lancsPeriodo = () => [...new Map(r.itens.map((it) => [it.l.id, it.l])).values()].sort((a, b) => a.data_ocorrencia.localeCompare(b.data_ocorrencia));
  const nomeArq = `analise-${P.ini}-a-${P.fim}`;
  const filtrosTxt = Object.entries(f).map(([k, v]) => (k.endsWith('categoria_id') ? D.mapa.categorias[v]?.nome : k === 'conta_id' ? D.mapa.contas[v]?.nome : k === 'cartao_id' ? D.mapa.cartoes[v]?.nome : k === 'projeto_id' ? D.projetos.find((p) => p.id === v)?.nome : D.mapa.pessoas[v]?.nome || D.mapa.perfis[v]?.nome)).filter(Boolean).join(', ');
  function excelAnalise() {
    const ok = exportarXLSX(D, lancsPeriodo(), nomeArq + '.xlsx', [
      { nome: 'Resumo', linhas: [{ Indicador: 'Receitas', Valor: r.tot.receitas / 100 }, { Indicador: 'Gastos', Valor: r.tot.despesas / 100 }, { Indicador: 'Sobrou', Valor: r.tot.resultado / 100 }] },
      { nome: 'Mês a mês', linhas: r.meses.map((ym, i) => ({ Mês: mesCurto(ym), Receitas: r.rxd[i].receitas / 100, Gastos: r.rxd[i].despesas / 100, Sobrou: r.rxd[i].resultado / 100 })) },
      { nome: 'Gastos por categoria', linhas: C.rankingValor(r.porCat.grupos).map((g, i) => ({ Posição: i + 1, Categoria: g.rotulo, Valor: g.valor / 100, Vezes: g.qtd, 'Participação %': +g.pct.toFixed(2) })) },
      { nome: 'Receitas por categoria', linhas: C.rankingValor(r.porCatRec.grupos).map((g, i) => ({ Posição: i + 1, Categoria: g.rotulo, Valor: g.valor / 100, Vezes: g.qtd, 'Participação %': +g.pct.toFixed(2) })) },
    ]);
    if (!ok) toast('Não há lançamentos no período para exportar.', 'erro');
  }

  return html`<div class="nao-imprimir">
  <div class="topo"><div><h2>Análises</h2><div class="sub">${P.rot}</div></div><span class="esp"></span>
    <div class="export-grupo">
      <button class="btn" onClick=${() => setImprimindo(true)} title="Relatório completo com avaliação da saúde financeira"><${Icone} n="printer" /> Relatório PDF</button>
      <button class="btn sec" onClick=${() => exportarCSV(D, lancsPeriodo(), nomeArq + '.csv') || toast('Nada para exportar.', 'erro')}><${Icone} n="download" /> CSV</button>
      <button class="btn sec" onClick=${excelAnalise}><${Icone} n="file-spreadsheet" /> Excel</button></div></div>

  <div class="card" style="margin-bottom:16px">
    <div class="filtros">
      <${Campo} rot="Período"><${Sel} valor=${preset} onChange=${mudarPreset} opcoes=${[{ v: 'mes', r: 'Mês selecionado' }, { v: '3m', r: 'Últimos 3 meses' }, { v: '6m', r: 'Últimos 6 meses' }, { v: '12m', r: 'Últimos 12 meses' }, { v: 'ano', r: 'Ano inteiro' }, { v: 'livre', r: 'Personalizado' }]} /></${Campo}>
      ${preset === 'livre' && html`<${Campo} rot="De"><input class="inp" type="date" value=${livre.ini} onInput=${(e) => setLivre({ ...livre, ini: e.target.value })} /></${Campo}>
        <${Campo} rot="Até"><input class="inp" type="date" value=${livre.fim} onInput=${(e) => setLivre({ ...livre, fim: e.target.value })} /></${Campo}>`}
      <button class="btn sec" onClick=${() => setVerFiltros(!verFiltros)}><${Icone} n="filter" /> Filtros${Object.keys(f).length ? ` (${Object.keys(f).length})` : ''}</button>
    </div>
    ${verFiltros && html`<div class="filtros" style="margin-top:12px">
      <${Campo} rot="Categoria"><${Sel} valor=${f.categoria_id} onChange=${(v) => set({ categoria_id: v, subcategoria_id: null })} vazio="Todas" opcoes=${[...opcoesCategorias(D, 'despesa', { arquivadas: true }), ...opcoesCategorias(D, 'receita', { arquivadas: true })]} /></${Campo}>
      ${subs.length > 0 && html`<${Campo} rot="Subcategoria"><${Sel} valor=${f.subcategoria_id} onChange=${(v) => set({ subcategoria_id: v })} vazio="Todas" opcoes=${subs} /></${Campo}>`}
      <${Campo} rot="Conta"><${Sel} valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} vazio="Todas" opcoes=${opcoesContas(D, { incluirArquivadas: true })} /></${Campo}>
      <${Campo} rot="Cartão"><${Sel} valor=${f.cartao_id} onChange=${(v) => set({ cartao_id: v })} vazio="Todos" opcoes=${D.cartoes.map((c) => ({ v: c.id, r: c.nome }))} /></${Campo}>
      <${Campo} rot="Lançado por"><${Sel} valor=${f.criado_por} onChange=${(v) => set({ criado_por: v })} vazio="Qualquer pessoa" opcoes=${D.perfis.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <${Campo} rot="Quem pagou/recebeu"><${Sel} valor=${f.pagador_id} onChange=${(v) => set({ pagador_id: v })} vazio="Qualquer pessoa" opcoes=${opcoesPessoas(D)} /></${Campo}>
      <${Campo} rot="Projeto"><${Sel} valor=${f.projeto_id} onChange=${(v) => set({ projeto_id: v })} vazio="Todos" opcoes=${D.projetos.map((p) => ({ v: p.id, r: p.nome }))} /></${Campo}>
      <button class="btn fantasma" onClick=${() => setF({})}><${Icone} n="x" /> Limpar</button>
    </div>`}
    <div style="margin-top:10px;font-size:12.5px;color:var(--txt3)">Compras no cartão contam no mês em que foram feitas; o pagamento da fatura não conta de novo. Transferências entre contas não entram.</div>
  </div>

  <div class="grade g-kpi" style="margin-bottom:16px">
    <div class="card kpi"><div class="rot">Receitas no período</div><div class="val num" style="color:var(--pos)">${brl(r.tot.receitas)}</div><div class="det">Tudo o que entrou</div></div>
    <div class="card kpi"><div class="rot">Gastos no período</div><div class="val num" style="color:var(--neg)">${brl(r.tot.despesas)}</div><div class="det">${r.tot.qtdDespesas} lançamento(s)</div></div>
    <div class="card kpi"><div class="rot">${r.tot.resultado >= 0 ? 'Sobrou' : 'Faltou'}</div><div class="val"><${Tom} v=${r.tot.resultado} /></div><div class="det">Receitas − gastos</div></div>
  </div>

  <${Comparacao3} tres=${r.tres} />

  ${r.itens.length === 0 ? html`<div class="card"><${Vazio} icone="chart-line" titulo="Sem dados para estes filtros" texto="Não há lançamentos realizados no período e base escolhidos. Ajuste o período, a base ou os filtros." /></div>` : html`
  <div class="card" style="margin-bottom:16px"><h3><${Icone} n="chart-column" /> Evolução ${tipoEv === 'gastos' ? 'dos gastos' : 'das receitas'}</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <div class="btn-grupo ev-tipo">
        <button class=${tipoEv === 'gastos' ? 'on gastos' : ''} onClick=${() => setTipoEv('gastos')}><${Icone} n="arrow-down" /> Gastos</button>
        <button class=${tipoEv === 'receitas' ? 'on receitas' : ''} onClick=${() => { setTipoEv('receitas'); setCats([]); }}><${Icone} n="arrow-up" /> Receitas</button></div>
      <div class="btn-grupo">${[['dia', 'Por dia'], ['semana', 'Por semana'], ['mes', 'Por mês']].map(([v, t]) => html`<button class=${gran === v ? 'on' : ''} onClick=${() => setGran(v)}>${t}</button>`)}</div>
    </div>
    <${Grafico} chave=${'ev' + tipoEv + chave} altura=${300} rotulo=${tipoEv === 'gastos' ? 'Evolução dos gastos' : 'Evolução das receitas'} cfg=${{ type: 'bar',
      data: { labels: r.serie.chaves.map(rotSerie), datasets:
        tipoEv === 'receitas' ? [{ label: 'Receitas', data: r.serieRec.vals.map((v) => v / 100), backgroundColor: '#16A34A', borderRadius: 6, maxBarThickness: 46 }]
        : cats.length ? r.porCatSerie.map(({ id, s }) => ({ label: D.mapa.categorias[id]?.nome, data: s.vals.map((v) => v / 100), backgroundColor: D.mapa.categorias[id]?.cor, borderRadius: 6, maxBarThickness: 46 }))
        : [{ label: 'Gastos', data: r.serie.vals.map((v) => v / 100), backgroundColor: '#E11D48', borderRadius: 6, maxBarThickness: 46 }] },
      options: optsEixo({ plugins: { legend: { display: cats.length > 1 }, tooltip: { callbacks: { label: tip } } } }) }} />
    <div class="ev-total">Total ${tipoEv === 'gastos' ? 'gasto' : 'recebido'} no período: <b class="num">${brl(tipoEv === 'gastos' ? r.tot.despesas : r.tot.receitas)}</b></div>
    ${tipoEv === 'gastos' && html`<div style="font-size:12.5px;color:var(--txt3);margin:12px 0 6px">Ver só uma categoria (toque para escolher):</div>
    <div class="chips" style="margin-bottom:10px">${catsDesp.map((c) => html`<button class=${'chip' + (cats.includes(c.id) ? ' on' : '')} style=${cats.includes(c.id) ? `background:${c.cor};border-color:${c.cor}` : ''}
      onClick=${() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}><${Icone} n=${c.icone} />${c.nome}</button>`)}</div>`}
    ${tipoEv === 'gastos' && (cats.length ? cats : [null]).map((id) => html`<${DetalheGastos} key=${id || 'todos'} D=${D} catId=${id} itens=${r.itens} itensA=${r.itensA} totalPeriodo=${r.tot.despesas} base=${base} abrir=${setFatia} />`)}
    ${tipoEv === 'receitas' && html`<${DetalheReceitas} D=${D} itens=${r.itens} abrir=${setFatia} />`}
  </div>

  <div class="grade g-2" style="margin-bottom:16px">
    <${Distribuicao} titulo="Distribuição dos gastos por categoria" icone="chart-pie" ag=${r.porCat} chave=${'pz' + chave} base=${base} abrir=${setFatia} vazio="Sem despesas no período" />
    <${Distribuicao} titulo="Distribuição das receitas por categoria" icone="hand-coins" ag=${r.porCatRec} chave=${'pr' + chave} base=${base} abrir=${setFatia} vazio="Sem receitas no período" receita />
  </div>

  <div class="grade" style="margin-bottom:16px">
    <div class="card"><h3><${Icone} n="chart-column" /> Receitas × gastos mês a mês</h3>
      <${Grafico} chave=${'rx' + chave} altura=${300} rotulo="Receitas versus despesas por mês" cfg=${{ type: 'bar',
        data: { labels: r.meses.map(mesCurto), datasets: [
          { type: 'line', label: 'Sobrou', data: r.rxd.map((t) => t.resultado / 100), borderColor: '#1B1F3B', backgroundColor: '#1B1F3B', pointRadius: 4, pointStyle: 'rectRot', tension: .2,
            segment: { borderColor: (ctx) => (ctx.p1.parsed.y < 0 ? '#D1343E' : '#12855A') }, pointBackgroundColor: r.rxd.map((t) => (t.resultado < 0 ? '#D1343E' : t.resultado > 0 ? '#12855A' : '#6B7280')) },
          { label: 'Receitas', data: r.rxd.map((t) => t.receitas / 100), backgroundColor: '#22C55E', borderRadius: 6 },
          { label: 'Gastos', data: r.rxd.map((t) => t.despesas / 100), backgroundColor: '#F43F5E', borderRadius: 6 },
        ] }, options: optsEixo() }} />
      <div class="tabela-wrap" style="margin-top:8px"><table class="tab"><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Gastos</th><th class="r">Sobrou</th></tr></thead>
        <tbody>${r.meses.map((ym, i) => html`<tr><td>${mesCurto(ym)}</td><td class="r num">${brl(r.rxd[i].receitas)}</td><td class="r num">${brl(r.rxd[i].despesas)}</td><td class="r"><${Tom} v=${r.rxd[i].resultado} /></td></tr>`)}</tbody></table></div>
    </div>
  </div>

  <div class="grade g-2" style="margin-bottom:16px">
    <${Ranking} titulo="Ranking por valor gasto" grupos=${C.rankingValor(r.rank.grupos)} base=${base} dim=${dimRank} setDim=${setDimRank} abrir=${setFatia} principal="valor" />
    <${Ranking} titulo="Ranking por frequência" grupos=${C.rankingFrequencia(r.rank.grupos)} base=${base} dim=${dimRank} setDim=${setDimRank} abrir=${setFatia} principal="qtd" />
  </div>`}

  <div class="grade g-2">
    <div class="card"><h3><${Icone} n="target" /> Planejado × realizado — ${nomeMesCap(mes)}</h3>
      ${r.orc.linhas.filter((l) => l.orcado != null).length ? html`<${Grafico} chave=${'orc' + mes + D.lancamentos.length + D.orcamentos.length} altura=${Math.max(220, r.orc.linhas.filter((l) => l.orcado != null).length * 46)} rotulo="Orçamento versus realizado por categoria" cfg=${{ type: 'bar',
          data: { labels: r.orc.linhas.filter((l) => l.orcado != null).map((l) => l.categoria.nome), datasets: [
            { label: 'Planejado', data: r.orc.linhas.filter((l) => l.orcado != null).map((l) => l.orcado / 100), backgroundColor: '#CBD5E1', borderRadius: 6 },
            { label: 'Realizado', data: r.orc.linhas.filter((l) => l.orcado != null).map((l) => l.gasto / 100), backgroundColor: r.orc.linhas.filter((l) => l.orcado != null).map((l) => (l.nivel === 'estourado' ? '#D1343E' : l.nivel === 'atencao' ? '#F59E0B' : l.categoria.cor)), borderRadius: 6 }] },
          options: { ...optsEixo(), indexAxis: 'y', scales: { x: { ticks: { callback: fmtEixo } }, y: { grid: { display: false } } } } }} />`
        : html`<${Vazio} icone="target" titulo="Nenhum limite por categoria definido"><a class="btn sec peq" href="#/orcamento">Definir orçamento</a></${Vazio}>`}
      <div style="font-size:12px;color:var(--txt3)">Usa o mês selecionado no topo (${nomeMesCap(mes)}) e não depende do período acima.</div>
    </div>
    <div class="card"><h3><${Icone} n="trending-up" /> Evolução do saldo <span class="acao"><span class="base-tag">Saldo das contas</span></span></h3>
      <${Grafico} chave=${'sd' + D.lancamentos.length + r.saldo.length + P.ini} altura=${300} rotulo="Evolução do saldo realizado e projetado" cfg=${{ type: 'line',
        data: { labels: r.saldo.map((s) => mesCurto(s.ym)), datasets: [
          { label: 'Realizado', data: r.saldo.map((s) => (s.realizado == null ? null : s.realizado / 100)), borderColor: '#5B4FE9', backgroundColor: '#5B4FE922', fill: true, tension: .25, pointRadius: 3 },
          { label: 'Projetado', data: r.saldo.map((s) => (s.projetado == null ? null : s.projetado / 100)), borderColor: '#F59E0B', borderDash: [7, 6], pointStyle: 'triangle', pointRadius: 4, tension: .25 },
        ] }, options: optsEixo() }} />
      <div style="font-size:12px;color:var(--txt3)">Linha contínua: saldo realizado no fim de cada mês. Tracejada (▲): projeção com previstos, recorrências e faturas.</div>
    </div>
  </div>

  ${fatia && html`<${Modal} titulo=${fatia.rotulo} onClose=${() => setFatia(null)} larg="larga">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px"><span class="pilula pri">${brl(fatia.valor)}</span><span class="pilula zero">${fatia.qtd} lançamento(s)</span><span class="pilula zero">${pct(fatia.pct)} do total</span></div>
    <div class="lista">${fatia.itens.slice().sort((a, b) => b.data.localeCompare(a.data)).map((it) => html`<${ItemLanc} l=${it.l} D=${D} />`)}</div>
  </${Modal}>`}</div>
  ${imprimindo && html`<${RelatorioAnalise} D=${D} P=${P} f=${f} mes=${mes} hoje=${H} perfil=${perfil} filtrosTxt=${filtrosTxt} />`}`;
}

function Distribuicao({ titulo, icone, ag, chave, base, abrir, vazio, receita }) {
  const gs = C.rankingValor(ag.grupos);
  return html`<div class="card"><h3><${Icone} n=${icone} /> ${titulo}</h3>
    ${gs.length ? html`
      <div style="position:relative">
        <${Grafico} chave=${chave} altura=${240} rotulo=${titulo} onClique=${(i) => abrir(gs[i])} cfg=${{ type: 'doughnut',
          data: { labels: gs.map((g) => g.rotulo), datasets: [{ data: gs.map((g) => g.valor / 100), backgroundColor: gs.map((g) => g.cor), borderColor: '#fff', borderWidth: 2 }] },
          options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(Math.round(c.raw * 100))} (${pct(ag.total ? (c.raw * 10000) / ag.total : 0)})` } } } } }} />
        <div class="rosca-centro"><small>${receita ? 'Total recebido' : 'Total gasto'}</small><b class="num" style=${receita ? 'color:var(--pos)' : ''}>${brl(ag.total)}</b></div>
      </div>
      <div class="legenda" style="margin-top:12px">${gs.map((g) => html`<div class="lg" role="button" tabIndex="0" onClick=${() => abrir(g)} onKeyDown=${(e) => e.key === 'Enter' && abrir(g)}>
        <${CatIcone} p cor=${g.cor} icone=${g.icone} /><span class="nm">${g.rotulo}</span><b class="num">${brl(g.valor)}</b><span class="pc">${pct(g.pct)}</span></div>`)}</div>
      <div style="font-size:12px;color:var(--txt3);margin-top:6px">Toque numa fatia ou categoria para ver os lançamentos.</div>`
    : html`<${Vazio} icone=${icone} titulo=${vazio} />`}
  </div>`;
}

/** Detalhamento de uma categoria (ou de todos os gastos): quanto, quanto do total, onde e em quê. */
function DetalheGastos({ D, catId, itens, itensA, totalPeriodo, base, abrir }) {
  const cat = catId ? D.mapa.categorias[catId] : null;
  const filtrar = (arr) => (catId ? arr.filter((it) => it.l.categoria_id === catId) : arr);
  const its = filtrar(itens).filter((it) => C.valorDespesa(it));
  const tot = C.totais(its).despesas, totA = C.totais(filtrar(itensA)).despesas;
  const qtd = its.filter((it) => it.natureza === 'despesa' || it.natureza === 'fatura').length;
  const maior = its.filter((it) => it.natureza !== 'reembolso').sort((a, b) => b.valor - a.valor)[0];
  const lugares = C.rankingValor(C.agrupar(D, its, 'favorecido').grupos);
  const subs = C.rankingValor(C.agrupar(D, its, catId ? 'subcategoria' : 'categoria').grupos).map((g) => ({ ...g, rotulo: catId && g.categoria_id !== catId ? g.rotulo.split(' › ').pop() : catId ? 'Sem subcategoria' : g.rotulo }));
  const cor = cat?.cor || '#5B4FE9';
  const titulo = cat ? cat.nome : 'Todos os gastos do período';
  if (!its.length) return html`<div class="detalhe-gasto" style=${`--c:${cor}`}><div class="det-cab"><${CatIcone} cor=${cor} icone=${cat?.icone || 'coins'} /><b>${titulo}</b></div>
    <${Vazio} icone="search" titulo="Nenhum gasto nesta categoria no período" texto="Escolha outro período ou outra categoria." /></div>`;
  const Lista = ({ titulo: t, grupos, icone }) => {
    const topo = grupos[0]?.valor || 1;
    return html`<div class="det-lista"><h4><${Icone} n=${icone} /> ${t}</h4>
      ${grupos.slice(0, 10).map((g, i) => html`<button type="button" class="det-linha" onClick=${() => abrir(g)} title="Ver os lançamentos">
        <span class=${'rank-pos p' + (i + 1)}>${i + 1}</span><${CatIcone} p cor=${g.cor} icone=${g.icone} />
        <span class="det-meio"><span class="det-nome">${g.rotulo}</span><span class="det-barra"><i style=${`width:${Math.max(2, (g.valor / topo) * 100)}%;background:${cor}`}></i></span>
          <small>${g.qtd} lançamento(s) · ${pct(tot ? (g.valor / tot) * 100 : 0)} ${cat ? 'da categoria' : 'do total'}</small></span>
        <b class="num">${brl(g.valor)}</b></button>`)}
      ${grupos.length > 10 && html`<small style="color:var(--txt3)">+ ${grupos.length - 10} outros</small>`}</div>`;
  };
  return html`<div class="detalhe-gasto" style=${`--c:${cor}`}>
    <div class="det-cab"><${CatIcone} cor=${cor} icone=${cat?.icone || 'coins'} /><b>${titulo}</b></div>
    <div class="det-kpis">
      <div class="det-kpi destaque"><small>Total gasto</small><b class="num">${brl(tot)}</b><span>no período</span></div>
      ${cat && html`<div class="det-kpi"><small>Do total de despesas</small><b class="num">${pct(totalPeriodo ? (tot / totalPeriodo) * 100 : 0)}</b><span class="det-barra"><i style=${`width:${totalPeriodo ? Math.min(100, (tot / totalPeriodo) * 100) : 0}%;background:${cor}`}></i></span></div>`}
      <div class="det-kpi"><small>Lançamentos</small><b class="num">${qtd}</b><span>Média ${qtd ? brl(Math.round(tot / qtd)) : '—'} cada</span></div>
      <div class="det-kpi"><small>Lugar onde mais gastou</small><b>${lugares[0]?.rotulo || '—'}</b><span>${lugares[0] ? `${brl(lugares[0].valor)} · ${pct(tot ? (lugares[0].valor / tot) * 100 : 0)}` : ''}</span></div>
      ${maior && html`<div class="det-kpi"><small>Maior gasto único</small><b class="num">${brl(maior.valor)}</b><span>${maior.l.descricao} · ${dataBR(maior.data)}</span></div>`}
    </div>
    <div class="grade g-2">
      <${Lista} titulo="Onde você mais gastou" grupos=${lugares} icone="store" />
      <${Lista} titulo=${cat ? 'Por subcategoria' : 'Por categoria'} grupos=${subs} icone="tag" />
    </div>
    <small style="color:var(--txt3)">“Lugar” é o estabelecimento informado no lançamento; quando ele está vazio, usamos a descrição. Toque numa linha para ver os lançamentos.</small>
  </div>`;
}

export function Variacao({ v, inverso }) {
  if (v == null) return html`<span class="pilula zero" title="Sem base de comparação">— sem comparação</span>`;
  const subiu = v > 0; const ruim = inverso ? subiu : !subiu;
  if (Math.abs(v) < 0.05) return html`<span class="pilula zero">● 0%</span>`;
  return html`<span class=${'pilula ' + (ruim ? 'neg' : 'pos')}>${subiu ? '▲' : '▼'} ${pct(Math.abs(v))}</span>`;
}

function Ranking({ titulo, grupos, base, dim, setDim, abrir, principal }) {
  const top = grupos.slice(0, 10);
  return html`<div class="card"><h3><${Icone} n=${principal === 'valor' ? 'coins' : 'repeat'} /> ${titulo}</h3>
    <div class="btn-grupo" style="margin-bottom:10px">${[['categoria', 'Categorias'], ['subcategoria', 'Subcategorias'], ['favorecido', 'Estabelecimentos']].map(([v, t]) => html`<button class=${dim === v ? 'on' : ''} onClick=${() => setDim(v)}>${t}</button>`)}</div>
    ${top.length ? html`<div class="tabela-wrap"><table class="tab"><thead><tr><th>#</th><th>${dim === 'favorecido' ? 'Estabelecimento' : 'Categoria'}</th><th class="r">Valor</th><th class="r">Vezes</th><th class="r">Part.</th></tr></thead>
      <tbody>${top.map((g, i) => html`<tr style="cursor:pointer" onClick=${() => abrir(g)}><td><span class=${'rank-pos p' + (i + 1)}>${i + 1}</span></td>
        <td><span style="display:flex;gap:8px;align-items:center"><${CatIcone} p cor=${g.cor} icone=${g.icone} /><span style="min-width:0">${g.rotulo}</span></span></td>
        <td class="r num" style=${principal === 'valor' ? 'font-weight:800' : ''}>${brl(g.valor)}</td><td class="r num" style=${principal === 'qtd' ? 'font-weight:800' : ''}>${g.qtd}</td><td class="r num">${pct(g.pct)}</td></tr>`)}</tbody></table></div>`
      : html`<${Vazio} icone="list" titulo="Sem dados" />`}</div>`;
}

/** Mês selecionado comparado com os 2 meses anteriores. */
function Comparacao3({ tres }) {
  const linhas = [['Receitas', 'receitas', false], ['Gastos', 'despesas', true], ['Sobrou', 'resultado', false]];
  return html`<div class="card" style="margin-bottom:16px"><h3><${Icone} n="calendar-days" /> Comparação com os 2 meses anteriores</h3>
    <div class="tabela-wrap"><table class="tab comp3"><thead><tr><th></th>${tres.map((t, i) => html`<th class="r">${nomeMesCap(t.ym)}${i === 2 ? ' (atual)' : ''}</th>`)}</tr></thead>
      <tbody>${linhas.map(([rot, k, inv]) => html`<tr><td><b>${rot}</b></td>${tres.map((t, i) => html`<td class="r">
        <div class="num" style=${`font-weight:${i === 2 ? 800 : 600};color:${k === 'receitas' ? 'var(--pos)' : k === 'despesas' ? 'var(--neg)' : t[k] < 0 ? 'var(--neg)' : 'var(--txt)'}`}>${brl(t[k])}</div>
        ${i > 0 && html`<div style="margin-top:2px"><${Variacao} v=${variacao(t[k], tres[i - 1][k])} inverso=${inv} /></div>`}</td>`)}</tr>`)}</tbody></table></div>
    <div style="font-size:12px;color:var(--txt3);margin-top:6px">As setas comparam cada mês com o mês anterior a ele. Mude o mês no topo da tela para comparar outros meses.</div>
  </div>`;
}

/** Todas as receitas do período: de onde veio e em que categoria. */
function DetalheReceitas({ D, itens, abrir }) {
  const its = itens.filter((it) => C.valorReceita(it) > 0);
  const tot = its.reduce((s, it) => s + C.valorReceita(it), 0);
  const cor = '#16A34A';
  if (!its.length) return html`<div class="detalhe-gasto" style=${`--c:${cor};margin-top:14px`}><div class="det-cab"><${CatIcone} cor=${cor} icone="hand-coins" /><b>Todas as receitas do período</b></div>
    <${Vazio} icone="hand-coins" titulo="Nenhuma receita no período" /></div>`;
  const origens = C.rankingValor(C.agrupar(D, its, 'favorecido', C.valorReceita).grupos);
  const porCat = C.rankingValor(C.agrupar(D, its, 'categoria', C.valorReceita).grupos);
  const maior = its.slice().sort((a, b) => b.valor - a.valor)[0];
  const Lista = ({ titulo: t, grupos, icone }) => {
    const topo = grupos[0]?.valor || 1;
    return html`<div class="det-lista"><h4><${Icone} n=${icone} /> ${t}</h4>
      ${grupos.slice(0, 10).map((g, i) => html`<button type="button" class="det-linha" onClick=${() => abrir(g)} title="Ver os lançamentos">
        <span class=${'rank-pos p' + (i + 1)}>${i + 1}</span><${CatIcone} p cor=${g.cor} icone=${g.icone} />
        <span class="det-meio"><span class="det-nome">${g.rotulo}</span><span class="det-barra"><i style=${`width:${Math.max(2, (g.valor / topo) * 100)}%;background:${cor}`}></i></span>
          <small>${g.qtd} lançamento(s) · ${pct(tot ? (g.valor / tot) * 100 : 0)} do total</small></span>
        <b class="num">${brl(g.valor)}</b></button>`)}</div>`;
  };
  return html`<div class="detalhe-gasto" style=${`--c:${cor};margin-top:14px`}>
    <div class="det-cab"><${CatIcone} cor=${cor} icone="hand-coins" /><b>Todas as receitas do período</b></div>
    <div class="det-kpis">
      <div class="det-kpi destaque"><small>Total recebido</small><b class="num">${brl(tot)}</b><span>no período</span></div>
      <div class="det-kpi"><small>Lançamentos</small><b class="num">${its.length}</b><span>Média ${brl(Math.round(tot / its.length))} cada</span></div>
      <div class="det-kpi"><small>Maior fonte</small><b>${origens[0]?.rotulo || '—'}</b><span>${origens[0] ? `${brl(origens[0].valor)} · ${pct(tot ? (origens[0].valor / tot) * 100 : 0)}` : ''}</span></div>
      <div class="det-kpi"><small>Maior receita única</small><b class="num">${brl(maior.valor)}</b><span>${maior.l.descricao} · ${dataBR(maior.data)}</span></div>
    </div>
    <div class="grade g-2">
      <${Lista} titulo="De onde veio" grupos=${origens} icone="building-2" />
      <${Lista} titulo="Por categoria" grupos=${porCat} icone="tag" />
    </div>
  </div>`;
}
